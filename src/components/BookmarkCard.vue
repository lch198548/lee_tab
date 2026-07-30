<template>
  <div class="bookmark-card" :class="{ favorite: bookmark.favorite }">
    <a
      :href="bookmark.url"
      class="card-link"
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
        <span v-if="bookmark.favorite" class="star-badge" title="常用">
          <StarFilledIcon />
        </span>
      </div>
      <div class="name" :title="bookmark.name">{{ bookmark.name }}</div>
    </a>
    <div class="card-actions">
      <button class="mini-btn" :title="bookmark.favorite ? '取消常用' : '设为常用'" @click.stop="onToggleFav">
        <StarFilledIcon v-if="bookmark.favorite" />
        <StarIcon v-else />
      </button>
      <button class="mini-btn" title="编辑" @click.stop="onEdit">
        <EditIcon />
      </button>
      <button class="mini-btn danger" title="删除" @click.stop="onDelete">
        <TrashIcon />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Bookmark } from '@/api'
import { EditIcon, TrashIcon, StarIcon, StarFilledIcon } from './icons'
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
  saveBookmarks(props.groupId, state.groups.find((g) => g.id === props.groupId)?.bookmarks || []).catch(() => {})
}

function onEdit() {
  ;(window as any).$openBookmarkEditor?.(props.groupId, props.bookmark)
}

async function onToggleFav() {
  const g = state.groups.find((x) => x.id === props.groupId)
  if (!g) return
  const b = g.bookmarks.find((x) => x.id === props.bookmark.id)
  if (!b) return
  b.favorite = !b.favorite
  try {
    await saveBookmarks(props.groupId, g.bookmarks)
    ;(window as any).$toast?.(b.favorite ? '已设为常用' : '已取消常用', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  border-radius: var(--radius);
  transition: var(--transition);
}

.card-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 10px;
  width: 100%;
  text-decoration: none;
  color: inherit;
  border-radius: var(--radius);
  transition: var(--transition);
}

.bookmark-card:hover .card-link {
  background: var(--bg-card);
  transform: translateY(-2px);
}

.icon-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--bg-glass-strong);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: var(--transition);
}

.bookmark-card:hover .icon-wrap {
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.25);
}

.favicon {
  width: 32px;
  height: 32px;
  /* 正方形图标,不裁剪,object-fit 保持比例 */
  border-radius: 6px;
  object-fit: contain;
  padding: 2px;
}

.fallback-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--accent);
  background: var(--bg-glass-strong);
}

.star-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--warning);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.star-badge svg {
  width: 11px;
  height: 11px;
  fill: #fff;
  stroke: #fff;
}

.name {
  font-size: 13px;
  color: var(--text-primary);
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.card-actions {
  display: flex;
  gap: 2px;
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: var(--transition);
  background: var(--bg-glass-strong);
  backdrop-filter: blur(10px);
  border-radius: 6px;
  padding: 2px;
}

.bookmark-card:hover .card-actions {
  opacity: 1;
}

.mini-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--text-secondary);
}

.mini-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.mini-btn.danger:hover {
  color: var(--danger);
}

.mini-btn svg {
  width: 13px;
  height: 13px;
}

@media (max-width: 640px) {
  .icon-wrap {
    width: 42px;
    height: 42px;
  }
  .favicon {
    width: 28px;
    height: 28px;
  }
  .fallback-icon {
    font-size: 16px;
  }
  .name {
    font-size: 12px;
  }
}
</style>
