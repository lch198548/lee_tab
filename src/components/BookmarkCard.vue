<template>
  <a
    :href="bookmark.url"
    class="bookmark-card"
    :target="openInNewTab ? '_blank' : '_self'"
    rel="noopener noreferrer"
    @click="onClick"
  >
    <div class="icon-wrap">
      <img
        v-if="iconSrc && !loadFailed"
        :src="iconSrc"
        :alt="bookmark.name"
        class="favicon"
        referrerpolicy="no-referrer"
        @error="onIconError"
      />
      <div v-else class="fallback-icon">{{ firstChar }}</div>
    </div>
    <div class="info">
      <div class="name">{{ bookmark.name }}</div>
      <div v-if="bookmark.desc" class="desc">{{ bookmark.desc }}</div>
    </div>
    <div class="card-actions" @click.prevent.stop>
      <button class="mini-btn" title="编辑" @click.stop="onEdit">
        <EditIcon />
      </button>
      <button class="mini-btn danger" title="删除" @click.stop="onDelete">
        <TrashIcon />
      </button>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Bookmark } from '@/api'
import { EditIcon, TrashIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useGroups } from '@/composables/useGroups'
import { faviconUrl, nextFavicon } from '@/utils/favicon'

const props = defineProps<{ bookmark: Bookmark; groupId: string }>()
const { state } = useAppStore()
const { saveBookmarks } = useGroups()

const openInNewTab = computed(() => state.config?.openInNewTab ?? true)
const firstChar = computed(() => props.bookmark.name?.[0]?.toUpperCase() || '?')

const iconSrc = ref(faviconUrl(props.bookmark.url))
const loadFailed = ref(false)

// URL 变化时重置图标
watch(
  () => props.bookmark.url,
  () => {
    iconSrc.value = faviconUrl(props.bookmark.url)
    loadFailed.value = false
  }
)

function onIconError() {
  const next = nextFavicon(props.bookmark.url, iconSrc.value)
  if (next) {
    iconSrc.value = next
  } else {
    loadFailed.value = true
  }
}

function onClick() {
  // 异步累计点击数(不影响跳转)
  props.bookmark.clicks = (props.bookmark.clicks || 0) + 1
  // 不阻塞跳转,后台保存
  saveBookmarks(props.groupId, state.groups.find((g) => g.id === props.groupId)?.bookmarks || []).catch(() => {})
}

function onEdit() {
  ;(window as any).$openBookmarkEditor?.(props.groupId, props.bookmark)
}

async function onDelete() {
  if (!confirm(`删除书签「${props.bookmark.name}」?`)) return
  const g = state.groups.find((x) => x.id === props.groupId)
  if (!g) return
  g.bookmarks = g.bookmarks.filter((b) => b.id !== props.bookmark.id)
  try {
    await saveBookmarks(props.groupId, g.bookmarks)
    ;(window as any).$toast?.('已删除', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}
</script>

<style scoped>
.bookmark-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: inherit;
  border: 1px solid transparent;
  transition: var(--transition);
  position: relative;
}

.bookmark-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-color);
}

.icon-wrap {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.favicon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
}

.fallback-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: var(--transition);
}

.bookmark-card:hover .card-actions {
  opacity: 1;
}

.mini-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--text-secondary);
}

.mini-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.mini-btn.danger:hover {
  color: var(--danger);
}
</style>
