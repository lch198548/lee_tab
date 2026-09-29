<template>
  <Teleport to="body">
    <div class="nm-mask" @click.self="$emit('close')">
      <div class="notes-manager modal-skin">
        <!-- 左侧:记事列表 -->
        <aside class="nm-side">
          <header class="nm-side-header">
            <span class="nm-side-title">记事本</span>
            <button class="nm-new-btn" title="新建记事" @click="onCreate"><PlusIcon /> 新建</button>
          </header>
          <div class="nm-list">
            <div
              v-for="n in sortedNotes"
              :key="n.id"
              class="nm-item"
              :class="{ active: n.id === activeId }"
              @click="selectNote(n.id)"
            >
              <div class="nm-item-main">
                <span class="nm-item-title">{{ noteTitle(n) }}</span>
                <span class="nm-item-snippet">{{ noteSnippet(n) }}</span>
              </div>
              <span class="nm-item-date">{{ formatDate(n.updatedAt) }}</span>
              <button class="nm-item-del" title="删除记事" @click.stop="onDelete(n.id)">
                <TrashIcon />
              </button>
            </div>
            <div v-if="sortedNotes.length === 0" class="nm-empty">
              <span class="nm-empty-icon"><NoteIcon /></span>
              <p>暂无记事</p>
              <button class="nm-new-btn" @click="onCreate"><PlusIcon /> 新建第一条</button>
            </div>
          </div>
        </aside>

        <!-- 右侧:编辑器 -->
        <main class="nm-main">
          <template v-if="activeNote">
            <div class="nm-editor-header">
              <span class="nm-editor-meta">
                <ClockIcon /> 最近编辑 {{ formatDateTime(activeNote.updatedAt) }}
                <transition name="nm-fade">
                  <span v-if="saveHint" class="nm-save-hint">✓ 已保存</span>
                </transition>
              </span>
              <button class="icon-btn" title="关闭" @click="$emit('close')"><CloseIcon /></button>
            </div>
            <textarea
              ref="editorRef"
              v-model="editorContent"
              class="nm-editor"
              placeholder="写点什么..."
              spellcheck="false"
            ></textarea>
          </template>
          <div v-else class="nm-editor-empty">
            <span class="nm-empty-icon"><NoteIcon /></span>
            <p>选择或新建一条记事开始编辑</p>
          </div>
        </main>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { PlusIcon, TrashIcon, NoteIcon, ClockIcon, CloseIcon } from './icons'
import { useNotes } from '@/composables/useNotes'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { dialog, confirm: dialogConfirm } = useDialog()

const { notes, loadNotes, createNote, updateNote, deleteNote } = useNotes()

// 记事按最近编辑排序
const sortedNotes = computed(() =>
  [...notes.value].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
)

// 当前选中的记事
const activeId = ref<string | null>(null)
const activeNote = computed(() => notes.value.find((n) => n.id === activeId.value) || null)

const editorContent = ref('')
const editorRef = ref<HTMLTextAreaElement | null>(null)
const saveHint = ref(false)

// 防抖自动保存(带 flush:切换记事/关闭弹窗时立即落盘,防止定时器被取消丢内容)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: { id: string; content: string } | null = null

watch(editorContent, (v) => {
  const note = activeNote.value
  if (!note || v === note.content) return
  note.content = v
  pendingSave = { id: note.id, content: v }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 500)
})

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!pendingSave) return
  const { id, content } = pendingSave
  pendingSave = null
  try {
    await updateNote(id, { content })
    saveHint.value = true
    setTimeout(() => (saveHint.value = false), 1600)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

// 切换选中记事时同步编辑器内容
watch(activeId, () => {
  flushSave()
  editorContent.value = activeNote.value?.content || ''
})

function selectNote(id: string) {
  activeId.value = id
}

function noteTitle(n: { content: string }) {
  const line = (n.content || '').split('\n').find((l) => l.trim()) || '(空记事)'
  return line.trim().slice(0, 24)
}

function noteSnippet(n: { content: string }) {
  const rest = (n.content || '').split('\n').filter((l) => l.trim()).slice(1).join(' ')
  return rest.trim().slice(0, 40) || '无更多内容'
}

function formatDate(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatDateTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x: number) => (x < 10 ? '0' + x : String(x))
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function onCreate() {
  try {
    const note = await createNote('')
    activeId.value = note.id
    editorContent.value = ''
    nextTick(() => editorRef.value?.focus())
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onDelete(id: string) {
  const n = notes.value.find((x) => x.id === id)
  if (!n) return
  const ok = await dialogConfirm({
    title: '删除记事',
    message: n.content ? '删除这条记事?内容将无法恢复。' : '删除这条空记事?',
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await deleteNote(id)
    if (activeId.value === id) {
      activeId.value = sortedNotes.value[0]?.id || null
    }
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (dialog.open) return
  emit('close')
}

onMounted(async () => {
  await loadNotes().catch(() => {})
  // 默认选中最近编辑的一条;没有则自动新建
  if (sortedNotes.value.length > 0) {
    activeId.value = sortedNotes.value[0].id
    editorContent.value = activeNote.value?.content || ''
  } else {
    onCreate()
  }
  window.addEventListener('keydown', onEscKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEscKey)
  // 关闭前把未落盘的编辑内容立即保存,防止防抖定时器被销毁丢数据
  flushSave()
})
</script>

<style scoped>
.nm-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: nmFade 0.2s var(--ease);
}

@keyframes nmFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.notes-manager {
  width: min(920px, 94vw);
  height: min(640px, 86vh);
  display: flex;
  border-radius: 20px;
  background: var(--bg-modal);
  backdrop-filter: blur(36px) saturate(1.7);
  -webkit-backdrop-filter: blur(36px) saturate(1.7);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: nmPop 0.25s var(--ease);
}

@keyframes nmPop {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* === 左侧列表 === */
.nm-side {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--bg-card) 40%, transparent);
}

.nm-side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.nm-side-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.nm-new-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: #fff;
  background: var(--accent);
  transition: 0.15s var(--ease);
}

.nm-new-btn:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.nm-new-btn svg {
  width: 13px;
  height: 13px;
}

.nm-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nm-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: 0.15s var(--ease);
}

.nm-item:hover {
  background: var(--bg-card-hover);
}

.nm-item.active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.nm-item-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding-right: 20px;
}

.nm-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nm-item.active .nm-item-title {
  color: var(--accent);
}

.nm-item-snippet {
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nm-item-date {
  font-size: 10.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.nm-item-del {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-muted);
  opacity: 0;
  transition: 0.15s;
}

.nm-item:hover .nm-item-del {
  opacity: 1;
}

.nm-item-del:hover {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}

.nm-item-del svg {
  width: 12px;
  height: 12px;
}

.nm-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  padding: 20px;
}

.nm-empty p {
  font-size: 12.5px;
}

/* === 右侧编辑器 === */
.nm-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.nm-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.nm-editor-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.nm-editor-meta svg {
  width: 13px;
  height: 13px;
}

.nm-save-hint {
  color: var(--success);
  font-weight: 500;
}

.nm-fade-enter-active,
.nm-fade-leave-active {
  transition: opacity 0.3s;
}

.nm-fade-enter-from,
.nm-fade-leave-to {
  opacity: 0;
}

.nm-editor {
  flex: 1;
  padding: 20px 22px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: inherit;
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--text-primary);
}

.nm-editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.nm-editor-empty p {
  font-size: 13px;
}

.icon-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--text-secondary);
  transition: 0.15s;
}

.icon-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.icon-btn svg {
  width: 15px;
  height: 15px;
}

@media (max-width: 720px) {
  .nm-mask {
    padding: 12px;
  }
  .notes-manager {
    flex-direction: column;
    height: 92vh;
  }
  .nm-side {
    width: 100%;
    max-height: 40%;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
}
</style>
