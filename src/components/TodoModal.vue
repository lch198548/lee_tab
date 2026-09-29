<template>
  <Teleport to="body">
    <div class="tdm-mask" @click.self="$emit('close')">
      <div class="todo-manager modal-skin">
        <!-- 左侧:筛选 + 清单 -->
        <aside class="tdm-side">
          <nav class="tdm-filters">
            <button
              v-for="f in filters"
              :key="f.id"
              class="tdm-filter-item"
              :class="{ active: activeFilter === f.id }"
              @click="activeFilter = f.id"
            >
              <span>{{ f.label }}</span>
              <span class="tdm-badge">{{ f.count }}</span>
            </button>
          </nav>

          <div class="tdm-lists">
            <div class="tdm-side-label">清单</div>
            <button
              v-for="l in lists"
              :key="l.id"
              class="tdm-filter-item"
              :class="{ active: activeFilter === 'list:' + l.id }"
              @click="activeFilter = ('list:' + l.id) as FilterId"
            >
              <span class="tdm-list-name">{{ l.name }}</span>
              <span class="tdm-badge">{{ listCount(l.id) }}</span>
              <span class="tdm-list-del" title="删除清单" @click.stop="onDeleteList(l.id, l.name)">
                <TrashIcon />
              </span>
            </button>
            <div v-if="lists.length === 0" class="tdm-lists-empty">暂无清单</div>
          </div>

          <footer class="tdm-side-footer">
            <button class="tdm-new-list" @click="onCreateList"><PlusIcon /> 新建清单</button>
          </footer>
        </aside>

        <!-- 右侧:标题 + 状态筛选 + 列表 -->
        <main class="tdm-main">
          <header class="tdm-header">
            <h3 class="tdm-title">
              {{ currentTitle }}
              <span class="tdm-total">共 {{ visibleTodos.length }} 条</span>
            </h3>
            <div class="tdm-header-actions">
              <div class="tdm-segmented" v-if="activeFilter !== 'done'">
                <button
                  v-for="s in stateTabs"
                  :key="s.id"
                  :class="{ active: stateTab === s.id }"
                  @click="stateTab = s.id"
                >
                  {{ s.label }}
                </button>
              </div>
              <button class="tdm-add-btn" @click="toggleQuickAdd">
                <PlusIcon /> 新建待办
              </button>
            </div>
          </header>

          <!-- 行内快速输入 -->
          <div class="tdm-quick-add" v-if="quickAddOpen">
            <input
              ref="quickInputRef"
              v-model="quickText"
              type="text"
              :placeholder="activeFilter.startsWith('list:') ? '输入任务,回车添加到当前清单...' : '输入任务,回车添加...'"
              @keydown.enter="submitQuick"
              @keydown.esc.stop="toggleQuickAdd"
            />
          </div>

          <div class="tdm-list">
            <template v-if="visibleTodos.length > 0">
              <div
                v-for="t in visibleTodos"
                :key="t.id"
                class="tdm-item"
                :class="{ done: t.done }"
              >
                <button class="tdm-check" :title="t.done ? '标记未完成' : '标记完成'" @click="onToggle(t.id)">
                  <CheckIcon />
                </button>
                <input
                  v-if="editingId === t.id"
                  ref="editInputRef"
                  v-model="editText"
                  class="tdm-edit"
                  type="text"
                  @keydown.enter="saveEdit"
                  @keydown.esc.stop="cancelEdit"
                  @blur="saveEdit"
                />
                <span v-else class="tdm-text" title="双击编辑" @dblclick="startEdit(t)">{{ t.text }}</span>
                <button
                  v-if="editingId !== t.id && lists.length > 0"
                  class="tdm-list-tag"
                  :title="'移动到其他清单'"
                  @click.stop="openListMenu($event, t)"
                >
                  {{ listName(t.listId) }}
                </button>
                <button
                  v-if="editingId !== t.id"
                  class="tdm-edit-btn"
                  title="编辑"
                  @click.stop="startEdit(t)"
                >
                  <EditIcon />
                </button>
                <button
                  class="tdm-star"
                  :class="{ on: t.important }"
                  :title="t.important ? '取消重要' : '标记重要'"
                  @click="onImportant(t.id)"
                >
                  <StarFilledIcon />
                </button>
                <span class="tdm-date">{{ formatDate(t) }}</span>
                <button class="tdm-del" title="删除" @click="onDelete(t.id)">
                  <TrashIcon />
                </button>
              </div>
            </template>
            <div v-else class="tdm-empty">
              <span class="tdm-empty-icon"><ClipboardIcon /></span>
              <p>暂无待办事项</p>
            </div>
          </div>
        </main>
      </div>
    </div>

    <!-- 清单移动弹出菜单(Teleport 到 body,避免被弹窗裁剪) -->
    <Teleport to="body">
      <div v-if="listMenu" class="lm-mask" @click="listMenu = null" @contextmenu.prevent="listMenu = null">
        <div class="lm-menu modal-skin" :style="{ left: listMenu.x + 'px', top: listMenu.y + 'px' }">
          <div class="lm-label">移动到清单</div>
          <button
            class="lm-item"
            :class="{ active: activeTodoListId === null }"
            @click="pickList(null)"
          >
            未分类
            <span v-if="activeTodoListId === null" class="lm-check"><CheckIcon /></span>
          </button>
          <button
            v-for="l in lists"
            :key="l.id"
            class="lm-item"
            :class="{ active: activeTodoListId === l.id }"
            @click="pickList(l.id)"
          >
            {{ l.name }}
            <span v-if="activeTodoListId === l.id" class="lm-check"><CheckIcon /></span>
          </button>
        </div>
      </div>
    </Teleport>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ClipboardIcon, CheckIcon, TrashIcon, StarFilledIcon, PlusIcon, EditIcon } from './icons'
import { useTodos } from '@/composables/useTodos'
import { useAppStore } from '@/stores/app'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { dialog, confirm: dialogConfirm, input: dialogInput } = useDialog()

const { state } = useAppStore()
const {
  todos,
  lists,
  activeTodos,
  doneTodos,
  createTodo,
  toggleTodo,
  toggleImportant,
  editTodo,
  setTodoList,
  deleteTodo,
  createList,
  deleteList
} = useTodos()

// === 左侧筛选 ===
type FilterId = 'all' | 'today' | 'week' | 'important' | 'done' | `list:${string}`
const activeFilter = ref<FilterId>('all')
const stateTab = ref<'all' | 'active' | 'done'>('all')

const stateTabs = [
  { id: 'all' as const, label: '全部' },
  { id: 'active' as const, label: '待完成' },
  { id: 'done' as const, label: '已完成' }
]

const isSameDay = (ts: number) => {
  const d = new Date(ts)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
const inWeek = (ts: number) => ts >= Date.now() - 7 * 24 * 3600 * 1000

const todayTodos = computed(() => activeTodos.value.filter((t) => isSameDay(t.createdAt)))
const weekTodos = computed(() => activeTodos.value.filter((t) => inWeek(t.createdAt)))
const importantTodos = computed(() => activeTodos.value.filter((t) => t.important))

const listCount = (listId: string) => activeTodos.value.filter((t) => t.listId === listId).length

const filters = computed<{ id: FilterId; label: string; count: number }[]>(() => [
  { id: 'all' as FilterId, label: '所有待办', count: activeTodos.value.length },
  { id: 'today' as FilterId, label: '今天', count: todayTodos.value.length },
  { id: 'week' as FilterId, label: '最近七天', count: weekTodos.value.length },
  { id: 'important' as FilterId, label: '重要', count: importantTodos.value.length },
  { id: 'done' as FilterId, label: '已完成', count: doneTodos.value.length }
])

const currentTitle = computed(() => {
  if (activeFilter.value === 'list:__none__') return '清单'
  if (activeFilter.value.startsWith('list:')) {
    const l = lists.value.find((x) => x.id === activeFilter.value.slice(5))
    return l?.name || '清单'
  }
  return filters.value.find((f) => f.id === activeFilter.value)?.label || '所有待办'
})

// === 可见列表(左侧筛选 × 状态分段) ===
const visibleTodos = computed(() => {
  let base: typeof todos.value
  switch (activeFilter.value) {
    case 'all':
      base = todos.value
      break
    case 'today':
      base = todos.value.filter((t) => isSameDay(t.createdAt))
      break
    case 'week':
      base = todos.value.filter((t) => inWeek(t.createdAt))
      break
    case 'important':
      base = todos.value.filter((t) => t.important)
      break
    case 'done':
      base = todos.value.filter((t) => t.done)
      break
    default: {
      const lid = activeFilter.value.slice(5)
      base = todos.value.filter((t) => t.listId === lid)
    }
  }
  // "已完成"侧栏项不受分段影响;其余按分段过滤
  if (activeFilter.value !== 'done') {
    if (stateTab.value === 'active') base = base.filter((t) => !t.done)
    else if (stateTab.value === 'done') base = base.filter((t) => t.done)
  }
  // 未完成在前,同级新的在前
  return [...base].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.createdAt - a.createdAt
  })
})

// === 快速新建 ===
const quickAddOpen = ref(false)
const quickText = ref('')
const quickInputRef = ref<HTMLInputElement | null>(null)

function toggleQuickAdd() {
  quickAddOpen.value = !quickAddOpen.value
  if (quickAddOpen.value) {
    nextTick(() => quickInputRef.value?.focus())
  } else {
    quickText.value = ''
  }
}

async function submitQuick() {
  const text = quickText.value.trim()
  if (!text) return
  try {
    const listId = activeFilter.value.startsWith('list:') ? activeFilter.value.slice(5) : null
    await createTodo(text, listId)
    quickText.value = ''
    quickInputRef.value?.focus()
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

// === 操作 ===
async function onToggle(id: string) {
  try {
    await toggleTodo(id)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onImportant(id: string) {
  try {
    await toggleImportant(id)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onDelete(id: string) {
  try {
    await deleteTodo(id)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

// === 行内编辑 ===
const editingId = ref<string | null>(null)
const editText = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

function startEdit(t: { id: string; text: string }) {
  editingId.value = t.id
  editText.value = t.text
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function cancelEdit() {
  editingId.value = null
  editText.value = ''
}

async function saveEdit() {
  const id = editingId.value
  if (!id) return
  const text = editText.value
  cancelEdit()
  const trimmed = text.trim()
  // 空内容视为取消,不改动
  if (!trimmed) return
  try {
    await editTodo(id, trimmed)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onCreateList() {
  const name = await dialogInput({ title: '新建清单', placeholder: '输入清单名称', confirmText: '创建' })
  if (!name) return
  try {
    const list = await createList(name)
    activeFilter.value = ('list:' + list.id) as FilterId
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onDeleteList(id: string, name: string) {
  const ok = await dialogConfirm({
    title: '删除清单',
    message: `删除清单「${name}」?其下待办将移回默认,此操作无法恢复。`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await deleteList(id)
    if (activeFilter.value === ('list:' + id) as FilterId) activeFilter.value = 'all'
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function formatDate(t: { done: boolean; completedAt: number | null; createdAt: number }) {
  const ts = t.done ? t.completedAt || t.createdAt : t.createdAt
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// === 清单移动 ===
const listMenu = ref<{ x: number; y: number; todoId: string } | null>(null)

const listName = (listId: string | null | undefined) =>
  (listId && lists.value.find((l) => l.id === listId)?.name) || '未分类'

const activeTodoListId = computed(() => {
  if (!listMenu.value) return undefined
  return todos.value.find((t) => t.id === listMenu.value!.todoId)?.listId ?? null
})

function openListMenu(e: MouseEvent, t: { id: string }) {
  const MENU_W = 180
  listMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
    y: Math.min(e.clientY, window.innerHeight - 40 - (lists.value.length + 2) * 34 - 8),
    todoId: t.id
  }
}

async function pickList(listId: string | null) {
  const id = listMenu.value?.todoId
  listMenu.value = null
  if (!id) return
  try {
    await setTodoList(id, listId)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

// === ESC 关闭(应用内对话框打开时交给对话框处理) ===
function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (dialog.open) return
  if (quickAddOpen.value) {
    toggleQuickAdd()
    return
  }
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onEscKey))
onUnmounted(() => window.removeEventListener('keydown', onEscKey))
</script>

<style scoped>
.tdm-mask {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: maskIn 0.18s ease;
}

@keyframes maskIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.todo-manager {
  width: 880px;
  max-width: 94vw;
  height: 600px;
  max-height: 86vh;
  display: flex;
  background: var(--bg-modal);
  backdrop-filter: blur(36px) saturate(1.8);
  -webkit-backdrop-filter: blur(36px) saturate(1.8);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: popIn 0.22s var(--ease);
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.96) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* === 左侧 === */
.tdm-side {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}

.tdm-filters {
  padding: 12px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tdm-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
  transition: 0.15s var(--ease);
}

.tdm-filter-item:hover {
  background: var(--bg-card-hover);
}

.tdm-filter-item.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-weight: 500;
}

.tdm-badge {
  margin-left: auto;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-card);
}

.tdm-filter-item.active .tdm-badge {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.tdm-lists {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tdm-side-label {
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px 10px 4px;
}

.tdm-list-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tdm-list-del {
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tdm-filter-item:hover .tdm-list-del {
  display: flex;
}

.tdm-list-del:hover {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.tdm-list-del svg {
  width: 12px;
  height: 12px;
}

.tdm-lists-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 10px;
}

.tdm-side-footer {
  padding: 10px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.tdm-new-list {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--accent);
  transition: 0.15s var(--ease);
}

.tdm-new-list:hover {
  background: var(--accent-hover);
}

.tdm-new-list svg {
  width: 14px;
  height: 14px;
}

/* === 右侧 === */
.tdm-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.tdm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
}

.tdm-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.tdm-total {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

.tdm-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tdm-segmented {
  display: flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.tdm-segmented button {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: 0.15s var(--ease);
}

.tdm-segmented button.active {
  color: #fff;
  background: var(--accent);
}

.tdm-add-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--accent);
  transition: 0.15s var(--ease);
}

.tdm-add-btn:hover {
  background: var(--accent-hover);
}

.tdm-add-btn svg {
  width: 14px;
  height: 14px;
}

.tdm-quick-add {
  padding: 0 20px 10px;
}

.tdm-quick-add input {
  width: 100%;
  padding: 10px 14px;
  font-size: 13px;
}

.tdm-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 12px;
}

.tdm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  transition: background 0.15s;
}

.tdm-item:hover {
  background: var(--bg-card-hover);
}

.tdm-check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: 0.15s;
}

.tdm-check:hover {
  border-color: var(--success);
  color: var(--success);
}

.tdm-item.done .tdm-check {
  border-color: var(--success);
  background: var(--success);
  color: #fff;
}

.tdm-check svg {
  width: 12px;
  height: 12px;
}

.tdm-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tdm-item.done .tdm-text {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* 清单标签 */
.tdm-list-tag {
  flex-shrink: 0;
  max-width: 96px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: 0.15s;
  opacity: 0.85;
}

.tdm-item:hover .tdm-list-tag {
  opacity: 1;
  color: var(--text-secondary);
}

.tdm-list-tag:hover {
  color: var(--accent) !important;
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

/* 清单移动菜单 */
.lm-mask {
  position: fixed;
  inset: 0;
  z-index: 2100;
}

.lm-menu {
  position: fixed;
  min-width: 180px;
  max-width: 260px;
  padding: 6px;
  border-radius: 12px;
  background: var(--bg-modal);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 1px;
  animation: lmIn 0.13s var(--ease);
}

@keyframes lmIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.lm-label {
  padding: 6px 10px 5px;
  font-size: 11px;
  color: var(--text-muted);
}

.lm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: 0.12s ease;
}

.lm-item:hover {
  background: var(--bg-card-hover);
}

.lm-item.active {
  color: var(--accent);
  font-weight: 500;
}

.lm-check {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.lm-check svg {
  width: 13px;
  height: 13px;
}

/* 行内编辑输入框 */
.tdm-edit {
  flex: 1;
  min-width: 0;
  padding: 4px 10px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 6px;
  outline: none;
}

.tdm-edit:focus {
  border-color: var(--accent);
}

.tdm-edit-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-muted);
  opacity: 0;
  flex-shrink: 0;
  transition: 0.15s;
}

.tdm-item:hover .tdm-edit-btn,
.tdm-item:hover .tdm-star,
.tdm-star.on {
  opacity: 1;
}

.tdm-edit-btn:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.tdm-edit-btn svg {
  width: 13px;
  height: 13px;
}

.tdm-star {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-muted);
  opacity: 0;
  flex-shrink: 0;
  transition: 0.15s;
}

.tdm-star.on {
  color: var(--warning);
}

.tdm-star:hover {
  color: var(--warning);
}

.tdm-star svg {
  width: 14px;
  height: 14px;
}

.tdm-date {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  width: 34px;
  text-align: right;
}

.tdm-del {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-muted);
  opacity: 0;
  flex-shrink: 0;
  transition: 0.15s;
}

.tdm-item:hover .tdm-del {
  opacity: 1;
}

.tdm-del:hover {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.tdm-del svg {
  width: 13px;
  height: 13px;
}

/* 空态 */
.tdm-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.tdm-empty-icon svg {
  width: 56px;
  height: 56px;
  color: var(--text-muted);
  opacity: 0.5;
}

.tdm-empty p {
  font-size: 13px;
}

/* 滚动条 */
.tdm-list::-webkit-scrollbar,
.tdm-lists::-webkit-scrollbar {
  width: 6px;
}

.tdm-list::-webkit-scrollbar-thumb,
.tdm-lists::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

@media (max-width: 720px) {
  .tdm-side {
    display: none;
  }
  .tdm-header {
    flex-wrap: wrap;
  }
}
</style>
