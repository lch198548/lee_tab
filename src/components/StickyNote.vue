<template>
  <div
    class="sticky-note"
    :style="noteStyle"
    @mousedown="onStartDrag"
  >
    <div class="note-header" @mousedown.stop>
      <div class="color-tools">
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
      <div class="note-actions">
        <button class="note-btn" title="编辑" @click="editing = true">
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
        auto-focus
      />
      <div
        v-else
        class="note-text"
        :style="{ color: note.textColor }"
        @dblclick="editing = true"
      >
        {{ note.content }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const noteStyle = computed(() => ({
  left: `${props.note.x}px`,
  top: `${props.note.y}px`,
  width: `${props.note.width}px`,
  height: `${props.note.height}px`,
  backgroundColor: props.note.bgColor,
  color: props.note.textColor
}))

// 拖拽
let dragging = false
let startX = 0
let startY = 0
let noteStartX = 0
let noteStartY = 0

function onStartDrag(e: MouseEvent) {
  if (editing.value) return
  dragging = true
  startX = e.clientX
  startY = e.clientY
  noteStartX = props.note.x
  noteStartY = props.note.y

  const onMove = (ev: MouseEvent) => {
    if (!dragging) return
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    let newX = noteStartX + dx
    let newY = noteStartY + dy
    // 限制在窗口内
    newX = Math.max(0, Math.min(window.innerWidth - props.note.width, newX))
    newY = Math.max(0, Math.min(window.innerHeight - props.note.height, newY))
    props.note.x = newX
    props.note.y = newY
  }

  const onUp = () => {
    dragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    // 保存位置
    updateNote(props.note.id, { x: props.note.x, y: props.note.y }).catch(() => {})
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
  const content = editContent.value.trim()
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
</style>
