<template>
  <div class="nav-page" @wheel.prevent="onWheel" ref="pageRef">
    <!-- 顶部工具栏 -->
    <header class="topbar">
      <div class="brand">
        <svg viewBox="0 0 32 32" width="22" height="22">
          <rect width="32" height="32" rx="6" fill="var(--accent)" />
          <rect x="6" y="6" width="8" height="8" rx="1.5" fill="#fff" opacity="0.9" />
          <rect x="18" y="6" width="8" height="8" rx="1.5" fill="#fff" opacity="0.7" />
          <rect x="6" y="18" width="8" height="8" rx="1.5" fill="#fff" opacity="0.7" />
          <rect x="18" y="18" width="8" height="8" rx="1.5" fill="#fff" opacity="0.9" />
        </svg>
        <span class="brand-name">{{ state.config?.title || '个人导航' }}</span>
      </div>

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
    <main class="content">
      <DateTime />
      <div class="search-area">
        <SearchBar />
      </div>

      <!-- 分组切换指示(顶部胶囊) -->
      <div class="group-tabs" v-if="state.groups.length > 0">
        <button
          v-for="(g, i) in state.groups"
          :key="g.id"
          class="group-tab"
          :class="{ active: i === currentIndex }"
          @click="switchTo(i)"
        >
          {{ g.name }}
        </button>
      </div>
      <div v-else class="empty">
        <p>还没有分组,点击右上角 + 添加你的第一个分组</p>
      </div>

      <!-- 当前分组书签 -->
      <div class="group-content" v-if="currentGroup">
        <!-- 常用书签区 -->
        <section v-if="favorites.length > 0" class="fav-section">
          <div class="section-label">
            <StarFilledIcon />
            <span>常用</span>
          </div>
          <div class="bookmark-grid">
            <BookmarkCard
              v-for="b in favorites"
              :key="b.id"
              :bookmark="b"
              :group-id="currentGroup.id"
            />
          </div>
        </section>

        <!-- 分隔线 -->
        <div v-if="favorites.length > 0 && normals.length > 0" class="divider"></div>

        <!-- 普通书签区 -->
        <section v-if="normals.length > 0" class="normal-section">
          <div class="bookmark-grid">
            <BookmarkCard
              v-for="b in normals"
              :key="b.id"
              :bookmark="b"
              :group-id="currentGroup.id"
            />
          </div>
        </section>

        <!-- 空分组提示 -->
        <div v-if="favorites.length === 0 && normals.length === 0" class="empty-group">
          <p>该分组还没有书签</p>
          <button class="btn-add" @click="onAddBookmark">
            <PlusIcon /> 添加书签
          </button>
        </div>

        <!-- 添加书签按钮(始终显示在底部) -->
        <button v-if="favorites.length > 0 || normals.length > 0" class="btn-add-floating" @click="onAddBookmark" title="添加书签">
          <PlusIcon />
        </button>
      </div>
    </main>

    <!-- 右侧悬浮分组切换 -->
    <GroupSidebar
      v-if="state.groups.length > 1"
      :groups="state.groups"
      :index="currentIndex"
      @change="switchTo"
    />

    <SettingsPanel v-if="state.settingsOpen" @close="state.settingsOpen = false" />
    <BookmarkEditor v-if="editor.open" :group-id="editor.groupId" :bookmark="editor.bookmark"
      @close="editor.open = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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

const { state } = useAppStore()
const { logout } = useAuth()
const { loadGroups, createGroup, renameGroup, deleteGroup } = useGroups()
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

const currentGroup = computed<Group | null>(() => {
  if (state.groups.length === 0) return null
  if (currentIndex.value >= state.groups.length) {
    currentIndex.value = state.groups.length - 1
  }
  return state.groups[currentIndex.value] || null
})

// 常用书签(显示在上方)
const favorites = computed(() => {
  const g = currentGroup.value
  if (!g) return []
  return g.bookmarks.filter((b) => b.favorite)
})

// 普通书签
const normals = computed(() => {
  const g = currentGroup.value
  if (!g) return []
  return g.bookmarks.filter((b) => !b.favorite)
})

function switchTo(i: number) {
  if (state.groups.length === 0) return
  let next = i
  if (next < 0) next = 0
  if (next > state.groups.length - 1) next = state.groups.length - 1
  if (next === currentIndex.value) return
  currentIndex.value = next
}

// 滚轮切换分组(带节流,避免滚动过快)
let lastWheelTime = 0
function onWheel(e: WheelEvent) {
  // 在书签操作按钮上滚动时不切组
  const target = e.target as HTMLElement
  if (target?.closest?.('.card-actions') || target?.closest?.('.modal') || target?.closest?.('.group-sidebar')) {
    return
  }
  const now = Date.now()
  if (now - lastWheelTime < 400) return
  lastWheelTime = now
  if (e.deltaY > 0) {
    switchTo(currentIndex.value + 1)
  } else if (e.deltaY < 0) {
    switchTo(currentIndex.value - 1)
  }
}

// 键盘左右切换
function onKeydown(e: KeyboardEvent) {
  // 输入框聚焦时不处理
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (e.key === 'ArrowLeft') switchTo(currentIndex.value - 1)
  else if (e.key === 'ArrowRight') switchTo(currentIndex.value + 1)
}

async function onAddGroup() {
  const name = window.prompt('请输入分组名称', '新分组')
  if (!name) return
  try {
    await createGroup(name.trim())
    // 切换到新分组
    currentIndex.value = state.groups.length - 1
    ;(window as any).$toast?.('分组已创建', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onRenameGroup() {
  const g = currentGroup.value
  if (!g) return
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
  if (!g) return
  if (!confirm(`删除分组「${g.name}」及其所有书签?`)) return
  try {
    await deleteGroup(g.id)
    if (currentIndex.value >= state.groups.length) {
      currentIndex.value = Math.max(0, state.groups.length - 1)
    }
    ;(window as any).$toast?.('分组已删除', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function onAddBookmark() {
  const g = currentGroup.value
  if (!g) {
    ;(window as any).$toast?.('请先创建分组', 'error')
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
  justify-content: space-between;
  gap: 20px;
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

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
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
  gap: 6px;
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
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  backdrop-filter: blur(8px);
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

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--warning);
  font-weight: 500;
  padding-left: 4px;
  margin-bottom: -8px;
}

.section-label svg {
  width: 14px;
  height: 14px;
  fill: var(--warning);
  stroke: var(--warning);
}

.divider {
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--border-strong),
    transparent
  );
  margin: 8px 0;
}

.bookmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
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

@media (max-width: 640px) {
  .topbar {
    padding: 10px 14px;
  }
  .brand-name {
    font-size: 14px;
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
    grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
    gap: 6px;
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
