<template>
  <div class="nav-page">
    <header class="topbar">
      <div class="brand">
        <svg viewBox="0 0 32 32" width="28" height="28">
          <rect width="32" height="32" rx="6" fill="var(--accent)" />
          <rect x="6" y="6" width="8" height="8" rx="1.5" fill="#fff" opacity="0.9" />
          <rect x="18" y="6" width="8" height="8" rx="1.5" fill="#fff" opacity="0.7" />
          <rect x="6" y="18" width="8" height="8" rx="1.5" fill="#fff" opacity="0.7" />
          <rect x="18" y="18" width="8" height="8" rx="1.5" fill="#fff" opacity="0.9" />
        </svg>
        <span class="brand-name">{{ state.config?.title || '个人导航' }}</span>
      </div>

      <SearchBar />

      <div class="actions">
        <button class="icon-btn" title="添加分组" @click="onAddGroup">
          <PlusIcon />
        </button>
        <button class="icon-btn" title="设置" @click="state.settingsOpen = true">
          <GearIcon />
        </button>
        <button class="icon-btn" title="退出登录" @click="onLogout">
          <LogoutIcon />
        </button>
      </div>
    </header>

    <main class="content">
      <draggable
        v-model="groupsModel"
        item-key="id"
        handle=".group-drag-handle"
        :animation="200"
        @end="onGroupDragEnd"
        class="groups-grid"
      >
        <template #item="{ element: group }">
          <GroupColumn :group="group" />
        </template>
      </draggable>

      <div v-if="state.groups.length === 0" class="empty">
        <p>还没有分组,点击右上角 + 添加你的第一个分组</p>
      </div>
    </main>

    <SettingsPanel v-if="state.settingsOpen" @close="state.settingsOpen = false" />
    <BookmarkEditor v-if="editor.open" :group-id="editor.groupId" :bookmark="editor.bookmark"
      @close="editor.open = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import draggable from 'vuedraggable'
import SearchBar from './SearchBar.vue'
import GroupColumn from './GroupColumn.vue'
import SettingsPanel from './SettingsPanel.vue'
import BookmarkEditor from './BookmarkEditor.vue'
import { PlusIcon, GearIcon, LogoutIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import { useGroups } from '@/composables/useGroups'
import { useConfig } from '@/composables/useConfig'
import type { Bookmark, Group } from '@/api'

const { state } = useAppStore()
const { logout } = useAuth()
const { loadGroups, createGroup, reorderGroups } = useGroups()
const { loadConfig } = useConfig()

// 书签编辑器状态(全局事件总线方式)
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

const groupsModel = computed<Group[]>({
  get: () => state.groups,
  set: (val) => {
    state.groups = val
  }
})

async function onGroupDragEnd() {
  await reorderGroups(state.groups)
}

async function onAddGroup() {
  const name = window.prompt('请输入分组名称', '新分组')
  if (!name) return
  try {
    await createGroup(name.trim())
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
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
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
})
</script>

<style scoped>
.nav-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 24px;
  background: var(--bg-card);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.icon-btn {
  width: 36px;
  height: 36px;
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

.content {
  flex: 1;
  padding: 24px;
  overflow-x: auto;
}

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
  max-width: 1600px;
  margin: 0 auto;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 80px 20px;
}

@media (max-width: 640px) {
  .topbar {
    padding: 12px 16px;
    gap: 12px;
  }
  .content {
    padding: 16px;
  }
  .groups-grid {
    grid-template-columns: 1fr;
  }
}
</style>
