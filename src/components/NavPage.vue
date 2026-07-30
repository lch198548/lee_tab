<template>
  <div class="nav-page" ref="pageRef">
    <!-- 顶部工具栏 -->
    <header class="topbar">
      <div class="actions">
        <button class="icon-btn" title="添加分组" @click="onAddGroup">
          <PlusIcon />
        </button>
        <button class="icon-btn" title="重命名当前分组" @click="onRenameGroup">
          <EditIcon />
        </button>
        <button class="icon-btn danger" title="删除当前分组" @click="onDeleteGroup">
          <TrashIcon />
        </button>
        <button class="icon-btn" title="设置" @click="state.settingsOpen = true">
          <GearIcon />
        </button>
        <button class="icon-btn" title="退出登录" @click="onLogout">
          <LogoutIcon />
        </button>
      </div>
    </header>

    <!-- 主体: 时钟 + 搜索框 + 当前分组书签 -->
    <main class="content" @wheel="onWheel">
      <DateTime />
      <div class="search-area">
        <SearchBar />
      </div>

      <!-- 分组切换指示(顶部胶囊) -->
      <div class="group-tabs" v-if="allGroups.length > 0">
        <Draggable
          v-model="allGroups"
          group="groups"
          item-key="id"
          :animation="150"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          drag-class="drag-dragging"
          :move="canMoveGroup"
          @change="onGroupSort"
        >
          <template #item="{ element, index }">
            <button
              class="group-tab"
              :class="{ active: index === currentIndex, 'fav-tab': element.id === FAV_GROUP_ID }"
              @click="switchTo(index)"
              :title="element.id === FAV_GROUP_ID ? '常用书签(来自所有分组)' : element.name"
            >
              <StarFilledIcon v-if="element.id === FAV_GROUP_ID" class="fav-icon" />
              {{ element.name }}
            </button>
          </template>
        </Draggable>
      </div>
      <div v-else class="empty">
        <p>还没有分组,点击右上角 + 添加你的第一个分组</p>
      </div>

      <!-- 当前分组书签 -->
      <div class="group-content" v-if="currentGroup">
        <!-- 常用分组:显示所有分组的常用书签 -->
        <template v-if="currentGroup.id === FAV_GROUP_ID">
          <div v-if="allFavorites.length > 0" class="bookmark-grid">
            <BookmarkCard
              v-for="b in allFavorites"
              :key="b.id"
              :bookmark="b"
              :group-id="b._groupId || ''"
            />
          </div>
          <div v-else class="empty-group">
            <p>还没有常用书签,在书签编辑中勾选"设为常用"</p>
          </div>
        </template>

        <!-- 普通分组:可拖拽排序 -->
        <template v-else>
          <Draggable
            v-model="currentGroup.bookmarks"
            :group="{ name: 'bookmarks', pull: false, put: false }"
            item-key="id"
            :animation="150"
            ghost-class="drag-ghost"
            chosen-class="drag-chosen"
            drag-class="drag-dragging"
            filter=".card-actions, .card-actions *"
            class="bookmark-grid"
            @change="onBookmarkSort"
          >
            <template #item="{ element }">
              <BookmarkCard
                :bookmark="element"
                :group-id="currentGroup.id"
              />
            </template>
          </Draggable>

          <div v-if="currentGroup.bookmarks.length === 0" class="empty-group">
            <p>该分组还没有书签</p>
            <button class="btn-add" @click="onAddBookmark">
              <PlusIcon /> 添加书签
            </button>
          </div>
        </template>

        <!-- 添加书签按钮 -->
        <button
          v-if="currentGroup.id !== FAV_GROUP_ID && currentGroup.bookmarks.length > 0"
          class="btn-add-floating"
          @click="onAddBookmark"
          title="添加书签"
        >
          <PlusIcon />
        </button>
      </div>
    </main>

    <!-- 右侧悬浮分组切换 -->
    <GroupSidebar
      v-if="allGroups.length > 1"
      :groups="allGroups"
      :index="currentIndex"
      @change="switchTo"
    />

    <SettingsPanel v-if="state.settingsOpen" @close="state.settingsOpen = false" />
    <BookmarkEditor
      v-if="editor.open"
      :group-id="editor.groupId"
      :bookmark="editor.bookmark"
      @close="editor.open = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import Draggable from 'vuedraggable'
import DateTime from './DateTime.vue'
import SearchBar from './SearchBar.vue'
import BookmarkCard from './BookmarkCard.vue'
import GroupSidebar from './GroupSidebar.vue'
import SettingsPanel from './SettingsPanel.vue'
import BookmarkEditor from './BookmarkEditor.vue'
import {
  PlusIcon,
  GearIcon,
  LogoutIcon,
  EditIcon,
  TrashIcon,
  StarFilledIcon
} from './icons'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import { useGroups } from '@/composables/useGroups'
import { useConfig } from '@/composables/useConfig'
import type { Bookmark, Group } from '@/api'

// 虚拟分组ID:代表"常用"
const FAV_GROUP_ID = '__favorites__'
const FAV_GROUP_NAME = '常用'

const { state } = useAppStore()
const { logout } = useAuth()
const { loadGroups, createGroup, renameGroup, deleteGroup, saveBookmarks, saveGroupSort } = useGroups()
const { loadConfig } = useConfig()

const editor = reactive<{ open: boolean; groupId: string; bookmark: Bookmark | null }>({
  open: false,
  groupId: '',
  bookmark: null
})

;(window as any).$openBookmarkEditor = (groupId: string, bookmark: Bookmark | null = null) => {
  editor.groupId = groupId
  editor.bookmark = bookmark
  editor.open = true
}

const pageRef = ref<HTMLElement | null>(null)
const currentIndex = ref(0)

// 合成分组列表:常用(虚拟) + 真实分组
const allGroups = computed(() => {
  const favGroup: Group = {
    id: FAV_GROUP_ID,
    name: FAV_GROUP_NAME,
    sort: -1,
    bookmarks: []
  }
  return [favGroup, ...state.groups]
})

// 当前选中的分组(含虚拟常用组)
const currentGroup = computed<Group | null>(() => {
  if (allGroups.value.length === 0) return null
  if (currentIndex.value >= allGroups.value.length) {
    currentIndex.value = allGroups.value.length - 1
  }
  return allGroups.value[currentIndex.value] || null
})

// 所有分组中标记为常用的书签(带 _groupId 来源标记)
const allFavorites = computed(() => {
  const result: (Bookmark & { _groupId: string })[] = []
  for (const g of state.groups) {
    for (const b of g.bookmarks) {
      if (b.favorite) {
        result.push({ ...b, _groupId: g.id })
      }
    }
  }
  return result
})

function switchTo(i: number) {
  if (allGroups.value.length === 0) return
  let next = i
  if (next < 0) next = 0
  if (next > allGroups.value.length - 1) next = allGroups.value.length - 1
  if (next === currentIndex.value) return
  currentIndex.value = next
}

// 滚轮切换分组(累积 deltaY,达到阈值切换一个,支持持续滚动)
let wheelAccum = 0
const WHEEL_THRESHOLD = 80
function onWheel(e: WheelEvent) {
  const target = e.target as HTMLElement
  if (
    target?.closest?.('.card-actions') ||
    target?.closest?.('.modal') ||
    target?.closest?.('.group-sidebar') ||
    target?.closest?.('.bookmark-grid') ||
    target?.closest?.('.search-box')
  ) {
    return
  }
  wheelAccum += e.deltaY
  if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
    if (wheelAccum > 0) {
      switchTo(currentIndex.value + 1)
    } else {
      switchTo(currentIndex.value - 1)
    }
    wheelAccum = 0
  }
  // 停止滚动一小段时间后重置
  clearTimeout((onWheel as any)._timer)
  ;(onWheel as any)._timer = setTimeout(() => { wheelAccum = 0 }, 200)
}

// 键盘左右切换
function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (e.key === 'ArrowLeft') switchTo(currentIndex.value - 1)
  else if (e.key === 'ArrowRight') switchTo(currentIndex.value + 1)
}

// 分组拖拽:禁止移动虚拟常用组,也禁止拖到常用组位置之前
function canMoveGroup(evt: any) {
  const draggedId = evt.draggedContext.element?.id
  if (draggedId === FAV_GROUP_ID) return false
  // 目标位置在第一个(常用组)之后才允许
  if (evt.relatedContext?.index === 0 && evt.relatedContext.element?.id === FAV_GROUP_ID) {
    return false
  }
  return true
}

// 分组排序变更
async function onGroupSort(newList: Group[]) {
  // 保持常用组在第一个位置
  const favIdx = newList.findIndex((g) => g.id === FAV_GROUP_ID)
  if (favIdx > 0) {
    const [fav] = newList.splice(favIdx, 1)
    newList.unshift(fav)
  }
  // 过滤出真实分组(不含虚拟常用组)
  const realGroups = newList.filter((g) => g.id !== FAV_GROUP_ID)
  const sorts = realGroups.map((g, i) => ({ id: g.id, sort: i }))
  try {
    await saveGroupSort(sorts)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

// 书签排序变更
async function onBookmarkSort() {
  const g = currentGroup.value
  if (!g || g.id === FAV_GROUP_ID) return
  try {
    await saveBookmarks(g.id, g.bookmarks)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onAddGroup() {
  const name = window.prompt('请输入分组名称', '新分组')
  if (!name) return
  try {
    await createGroup(name.trim())
    // 切换到新分组(在 allGroups 中的索引是 state.groups.length,因为前面有常用虚拟组)
    currentIndex.value = allGroups.value.length - 1
    ;(window as any).$toast?.('分组已创建', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onRenameGroup() {
  const g = currentGroup.value
  if (!g || g.id === FAV_GROUP_ID) return
  const name = window.prompt('修改分组名称', g.name)
  if (!name || !name.trim()) return
  try {
    await renameGroup(g.id, name.trim())
    ;(window as any).$toast?.('已重命名', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onDeleteGroup() {
  const g = currentGroup.value
  if (!g || g.id === FAV_GROUP_ID) return
  if (!confirm(`删除分组「${g.name}」及其所有书签?`)) return
  try {
    await deleteGroup(g.id)
    if (currentIndex.value >= allGroups.value.length) {
      currentIndex.value = Math.min(allGroups.value.length - 1, 0)
    }
    ;(window as any).$toast?.('分组已删除', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function onAddBookmark() {
  const g = currentGroup.value
  if (!g || g.id === FAV_GROUP_ID) {
    ;(window as any).$toast?.('请先选择一个真实分组', 'error')
    return
  }
  ;(window as any).$openBookmarkEditor?.(g.id, null)
}

async function onLogout() {
  if (!confirm('确定退出登录?')) return
  await logout()
}

onMounted(async () => {
  if (!state.config) {
    try {
      await loadConfig()
    } catch (e) {
      ;(window as any).$toast?.((e as Error).message, 'error')
    }
  }
  try {
    await loadGroups()
    currentIndex.value = 0
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
  window.addEventListener('keydown', onKeydown)
  // 加载完成后自动聚焦搜索框
  nextTick(() => {
    const input = document.querySelector('.search-box input') as HTMLInputElement
    if (input) input.focus()
  })
})
</script>

<style scoped>
.nav-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部工具栏 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 12px 24px;
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}

.actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.icon-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.icon-btn.danger:hover {
  color: var(--danger);
}

.icon-btn svg {
  width: 17px;
  height: 17px;
}

/* 主体内容 */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 32px 24px 24px;
  overflow-y: auto;
  overflow-x: hidden;
}

.search-area {
  width: 100%;
  max-width: 720px;
  display: flex;
  justify-content: center;
}

/* 分组切换标签 */
.group-tabs {
  display: flex;
  gap: 0;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 100%;
}

.group-tab {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  cursor: grab;
  transition: var(--transition);
  white-space: nowrap;
  backdrop-filter: blur(8px);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 4px;
}

.group-tab:hover {
  color: var(--text-primary);
  background: var(--bg-card-hover);
}

.group-tab.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.group-tab.fav-tab {
  color: var(--warning);
  border-color: var(--warning);
}

.group-tab.fav-tab.active {
  color: #fff;
  background: var(--warning);
  border-color: var(--warning);
}

.fav-icon {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

/* 分组内容区 */
.group-content {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  padding-bottom: 20px;
}

.bookmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
  width: 100%;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 20px;
  font-size: 14px;
}

.empty-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
}

.btn-add:hover {
  background: var(--accent-hover);
}

.btn-add svg {
  width: 16px;
  height: 16px;
}

.btn-add-floating {
  position: fixed;
  right: 80px;
  bottom: 32px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
  z-index: 50;
  transition: var(--transition);
}

.btn-add-floating:hover {
  background: var(--accent-hover);
  transform: scale(1.08) rotate(90deg);
}

.btn-add-floating svg {
  width: 24px;
  height: 24px;
}

/* 拖拽样式 */
.drag-ghost {
  opacity: 0.4;
  background: var(--accent) !important;
}

.drag-chosen {
  transform: scale(1.05);
}

.drag-dragging {
  opacity: 0.5;
  cursor: grabbing !important;
}

@media (max-width: 640px) {
  .topbar {
    padding: 10px 14px;
  }
  .content {
    padding: 20px 14px 16px;
    gap: 18px;
  }
  .icon-btn {
    width: 30px;
    height: 30px;
  }
  .icon-btn svg {
    width: 15px;
    height: 15px;
  }
  .bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }
  .group-tab {
    padding: 5px 12px;
    font-size: 12px;
  }
  .btn-add-floating {
    right: 60px;
    bottom: 20px;
    width: 44px;
    height: 44px;
  }
  .btn-add-floating svg {
    width: 20px;
    height: 20px;
  }
}
</style>
