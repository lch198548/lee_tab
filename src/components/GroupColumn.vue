<template>
  <div class="group-col">
    <div class="group-header">
      <button class="group-drag-handle" title="拖动排序">
        <DragHandleIcon />
      </button>
      <input
        v-if="editing"
        v-model="editName"
        class="group-title-input"
        @blur="onRename"
        @keyup.enter="onRename"
        @keyup.esc="cancelRename"
        ref="titleInputRef"
      />
      <h2 v-else class="group-title" @dblclick="startRename">{{ group.name }}</h2>

      <button class="icon-btn-mini" title="添加书签" @click="onAddBookmark">
        <PlusIcon />
      </button>
      <button class="icon-btn-mini danger" title="删除分组" @click="onDelete">
        <TrashIcon />
      </button>
    </div>

    <draggable
      v-model="bookmarksModel"
      item-key="id"
      :group="{ name: 'bookmarks', pull: true, put: true }"
      :animation="200"
      ghost-class="bookmark-ghost"
      @end="onDragEnd"
      class="bookmark-list"
    >
      <template #item="{ element }">
        <BookmarkCard :bookmark="element" :group-id="group.id" />
      </template>
    </draggable>

    <div v-if="group.bookmarks.length === 0" class="empty-hint">点击 + 添加书签</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import draggable from 'vuedraggable'
import BookmarkCard from './BookmarkCard.vue'
import { DragHandleIcon, PlusIcon, TrashIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useGroups } from '@/composables/useGroups'
import type { Bookmark, Group } from '@/api'

const props = defineProps<{ group: Group }>()
const { state } = useAppStore()
const { renameGroup, deleteGroup, saveBookmarks } = useGroups()

const bookmarksModel = computed<Bookmark[]>({
  get: () => props.group.bookmarks,
  set: (val) => {
    // vuedraggable 在跨分组拖拽时会更新本地数组,这里只负责触发保存
    // 实际的源/目标分组同步在 onDragEnd 中处理
    const g = state.groups.find((x) => x.id === props.group.id)
    if (g) g.bookmarks = val
  }
})

async function onDragEnd() {
  // 拖拽后,保存所有受影响的分组(简单起见:保存当前分组)
  // 跨分组拖拽时,vuedraggable 会修改双方数组,这里只保存当前分组
  // 实际上需要在 NavPage 监听全局 groups 变化统一保存
  // 这里仅保存当前分组
  await saveBookmarks(props.group.id, props.group.bookmarks)

  // 跨分组拖拽:其他分组的 bookmarks 也已被 vuedraggable 修改
  // 遍历保存所有变化的分组
  for (const g of state.groups) {
    if (g.id !== props.group.id) {
      // 简单起见,所有分组都保存一遍(个人用书签数不多,可接受)
      try {
        await saveBookmarks(g.id, g.bookmarks)
      } catch (e) {
        /* 忽略 */
      }
    }
  }
}

const editing = ref(false)
const editName = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

function startRename() {
  editName.value = props.group.name
  editing.value = true
  nextTick(() => titleInputRef.value?.focus())
}

function cancelRename() {
  editing.value = false
}

async function onRename() {
  const name = editName.value.trim()
  editing.value = false
  if (!name || name === props.group.name) return
  try {
    await renameGroup(props.group.id, name)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function onAddBookmark() {
  ;(window as any).$openBookmarkEditor?.(props.group.id, null)
}

async function onDelete() {
  if (!confirm(`删除分组「${props.group.name}」及其所有书签?`)) return
  try {
    await deleteGroup(props.group.id)
    ;(window as any).$toast?.('分组已删除', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}
</script>

<style scoped>
.group-col {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 14px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.group-drag-handle {
  cursor: grab;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  padding: 4px;
}

.group-drag-handle:active {
  cursor: grabbing;
}

.group-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.group-title-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 15px;
  font-weight: 600;
}

.icon-btn-mini {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-secondary);
}

.icon-btn-mini:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.icon-btn-mini.danger:hover {
  color: var(--danger);
}

.bookmark-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 40px;
}

.empty-hint {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 20px 0;
  opacity: 0.6;
}

:deep(.bookmark-ghost) {
  opacity: 0.4;
  background: var(--bg-card-hover);
}
</style>
