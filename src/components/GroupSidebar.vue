<template>
  <aside class="group-sidebar" @contextmenu.prevent>
    <!-- 分组列表 -->
    <nav class="gs-list">
      <!-- 常用(虚拟分组,置顶不可拖) -->
      <button
        class="gs-item"
        :class="{ active: index === 0, 'drop-target': dropTargetIdx === 0 }"
        @click="$emit('change', 0)"
        @dragover="onItemDragOver"
        @dragleave="dropTargetIdx = -1"
        @drop.prevent="onItemDrop($event, 0)"
        title="拖入书签可设为常用"
      >
        <span class="gs-item-icon"><StarFilledIcon /></span>
        <span class="gs-item-name">常用</span>
      </button>

      <Draggable
        v-model="realGroups"
        item-key="id"
        :animation="150"
        ghost-class="gs-drag-ghost"
        chosen-class="gs-drag-chosen"
        handle=".gs-item"
        @end="onSortEnd"
      >
        <template #item="{ element, index: i }">
          <button
            class="gs-item"
            :class="{ active: index === i + 1, 'drop-target': dropTargetIdx === i + 1 }"
            :title="element.name"
            @click="$emit('change', i + 1)"
            @dragover="onItemDragOver"
            @dragleave="dropTargetIdx = -1"
            @drop.prevent="onItemDrop($event, i + 1)"
            @contextmenu.prevent="openContextMenu($event, element.id)"
          >
            <span class="gs-item-icon"><GroupIcon :icon="element.icon" :size="16" /></span>
            <span class="gs-item-name">{{ element.name }}</span>
          </button>
        </template>
      </Draggable>
    </nav>

    <!-- 底部操作区 -->
    <div class="gs-footer">
      <button class="gs-item gs-action" @click="editorGroup = null" title="添加分组">
        <span class="gs-item-icon"><PlusIcon /></span>
        <span class="gs-item-name">添加分组</span>
      </button>
      <button
        class="gs-item gs-action"
        :class="{ active: settingsActive }"
        @click="$emit('open-settings')"
        title="设置"
      >
        <span class="gs-item-icon"><GearIcon /></span>
        <span class="gs-item-name">设置</span>
      </button>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu" class="ctx-mask" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div
          class="ctx-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        >
          <button class="ctx-item" @click="onEditGroup">
            <EditIcon /> 编辑分组
          </button>
          <button class="ctx-item danger" @click="onDeleteGroup">
            <TrashIcon /> 删除分组
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 分组编辑/新建弹窗(Teleport 到 body:侧边栏 backdrop-filter 会劫持 fixed 定位,必须逃逸) -->
    <Teleport to="body">
      <GroupEditorModal
        v-if="editorGroup !== undefined"
        :key="editorGroup?.id || '__new__'"
        :group="editorGroup"
        @close="editorGroup = undefined"
        @saved="onGroupSaved"
      />
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Draggable from 'vuedraggable'
import type { Group } from '@/api'
import GroupIcon from './GroupIcon.vue'
import GroupEditorModal from './GroupEditorModal.vue'
import { StarFilledIcon, PlusIcon, GearIcon, EditIcon, TrashIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useGroups } from '@/composables/useGroups'
import { useDialog } from '@/composables/useDialog'

const props = defineProps<{ index: number; settingsActive?: boolean }>()
const emit = defineEmits<{
  (e: 'change', index: number): void
  (e: 'open-settings'): void
}>()

const { state } = useAppStore()
const { deleteGroup, saveGroupSort, moveBookmarkToGroup, saveBookmarks } = useGroups()
const { confirm: dialogConfirm } = useDialog()

// === 书签拖入分组(从书签卡拖到侧边栏完成移动/设为常用) ===
const dropTargetIdx = ref(-1) // 组合列表索引(0=常用)

function onItemDragOver(e: DragEvent) {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('application/x-bookmark-move')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
}

async function onItemDrop(e: DragEvent, combinedIndex: number) {
  dropTargetIdx.value = -1
  if (!e.dataTransfer) return
  const raw = e.dataTransfer.getData('application/x-bookmark-move')
  if (!raw) return
  let data: { bookmarkId: string; groupId: string }
  try {
    data = JSON.parse(raw)
  } catch {
    return
  }
  const { bookmarkId, groupId } = data
  if (!bookmarkId || !groupId) return

  try {
    if (combinedIndex === 0) {
      // 拖到「常用」=> 设为常用(仍在原分组)
      const g = state.groups.find((x) => x.id === groupId)
      const b = g?.bookmarks.find((x) => x.id === bookmarkId)
      if (!g || !b) return
      b.favorite = true
      await saveBookmarks(groupId, g.bookmarks)
      ;(window as any).$toast?.('已设为常用', 'success')
    } else {
      const target = state.groups[combinedIndex - 1]
      if (!target || target.id === groupId) return
      await moveBookmarkToGroup(groupId, bookmarkId, target.id)
      ;(window as any).$toast?.(`已移动到「${target.name}」`, 'success')
    }
  } catch (err) {
    ;(window as any).$toast?.((err as Error).message, 'error')
  }
}

// 真实分组(可拖拽排序);组合列表索引 = 此处索引 + 1(0 留给常用虚拟组)
const realGroups = computed<Group[]>(() => state.groups)

async function onSortEnd() {
  try {
    const sorts = state.groups.map((g, i) => ({ id: g.id, sort: i }))
    await saveGroupSort(sorts)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

// === 右键菜单 ===
const contextMenu = ref<{ x: number; y: number; groupId: string } | null>(null)

function openContextMenu(e: MouseEvent, groupId: string) {
  const menuW = 132
  const menuH = 84
  contextMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - menuW - 8),
    y: Math.min(e.clientY, window.innerHeight - menuH - 8),
    groupId
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

// === 分组编辑 ===
// undefined = 关闭;null = 新建;Group = 编辑
const editorGroup = ref<Group | null | undefined>(undefined)

function onEditGroup() {
  const g = state.groups.find((x) => x.id === contextMenu.value?.groupId)
  contextMenu.value = null
  if (g) editorGroup.value = { ...g }
}

async function onDeleteGroup() {
  const id = contextMenu.value?.groupId
  contextMenu.value = null
  const g = state.groups.find((x) => x.id === id)
  if (!g) return
  const ok = await dialogConfirm({
    title: '删除分组',
    message: `删除分组「${g.name}」及其所有书签?此操作无法恢复。`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await deleteGroup(g.id)
    ;(window as any).$toast?.('分组已删除', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function onGroupSaved(g: Group) {
  // 新建分组后切换过去(组合列表索引 = state.groups 新长度,即最后一项)
  const idx = state.groups.findIndex((x) => x.id === g.id)
  if (idx >= 0) emit('change', idx + 1)
}

function onGlobalClick(e: MouseEvent) {
  if (contextMenu.value && !(e.target as HTMLElement)?.closest?.('.ctx-menu')) {
    contextMenu.value = null
  }
}

onMounted(() => window.addEventListener('click', onGlobalClick))
onUnmounted(() => window.removeEventListener('click', onGlobalClick))
</script>

<style scoped>
.group-sidebar {
  width: 72px;
  flex-shrink: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg);
  backdrop-filter: blur(32px) saturate(1.7);
  -webkit-backdrop-filter: blur(32px) saturate(1.7);
  border-right: 1px solid var(--border-color);
  z-index: 60;
}

/* 分组列表(内容垂直居中,溢出时自动退化为顶部对齐可滚动) */
.gs-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  scrollbar-width: none;
}

.gs-list::before,
.gs-list::after {
  content: '';
  flex-shrink: 0;
  margin-top: auto;
  margin-bottom: auto;
}

.gs-list::-webkit-scrollbar {
  display: none;
}

/* 窄条:图标在上、小字在下竖排 */
.gs-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 9px 2px 7px;
  border-radius: 10px;
  color: var(--sidebar-text);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  transition: 0.15s var(--ease);
  position: relative;
  text-align: center;
}

.gs-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.gs-item:active {
  transform: scale(0.93);
}

.gs-item:hover .gs-item-icon {
  transform: scale(1.12);
}

.gs-item-icon {
  transition: transform 0.2s var(--ease);
}

.gs-item.active {
  /* 选中态:白色图标/文字 + 中性深色底衬(不用主题蓝,亮暗主题下都保持可读) */
  background: rgba(0, 0, 0, 0.24);
  color: #ffffff;
  font-weight: 500;
}

.gs-item.active:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 书签拖入高亮 */
.gs-item.drop-target {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.gs-item-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.gs-item-icon svg {
  width: 18px;
  height: 18px;
}

.gs-item-name {
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 底部操作区 */
.gs-footer {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gs-action {
  color: var(--sidebar-text);
}

/* 右键菜单 */
.ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
}

.ctx-menu {
  position: fixed;
  min-width: 132px;
  background: var(--bg-modal);
  backdrop-filter: blur(32px) saturate(1.7);
  -webkit-backdrop-filter: blur(32px) saturate(1.7);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: ctxIn 0.12s var(--ease);
}

@keyframes ctxIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: 0.12s ease;
}

.ctx-item:hover {
  background: var(--bg-card-hover);
}

.ctx-item.danger {
  color: var(--danger);
}

.ctx-item.danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.ctx-item svg {
  width: 14px;
  height: 14px;
}

/* 拖拽 */
.gs-drag-ghost {
  opacity: 0.4;
  background: var(--accent) !important;
  color: #fff !important;
}

.gs-drag-chosen {
  transform: scale(1.02);
}
</style>
