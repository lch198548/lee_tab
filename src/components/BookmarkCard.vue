<template>
  <div
    class="bookmark-card"
    :class="{ favorite: bookmark.favorite }"
    :draggable="nativeDrag"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @contextmenu.prevent="openMenu"
  >
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
        <div v-else class="fallback-icon" :style="{ background: fallbackBg }">{{ firstChar }}</div>
      </div>
      <div class="name" :title="bookmark.name">{{ bookmark.name }}</div>
    </a>

    <!-- 右键菜单(Teleport 到 body,避免毛玻璃祖先劫持 fixed 定位) -->
    <Teleport to="body">
      <div v-if="menu" class="ctx-mask" @click="closeMenu" @contextmenu.prevent="closeMenu">
        <div class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
          <button class="ctx-item" @click="onToggleFav">
            <StarFilledIcon v-if="bookmark.favorite" />
            <StarIcon v-else />
            {{ bookmark.favorite ? '取消常用' : '设为常用' }}
          </button>
          <button class="ctx-item" @click="onEdit">
            <EditIcon /> 编辑
          </button>
          <button class="ctx-item danger" @click="onDelete">
            <TrashIcon /> 删除
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Bookmark } from '@/api'
import { EditIcon, TrashIcon, StarIcon, StarFilledIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useGroups } from '@/composables/useGroups'
import { faviconUrl, nextFavicon } from '@/utils/favicon'
import { useDialog } from '@/composables/useDialog'

const props = withDefaults(
  defineProps<{ bookmark: Bookmark; groupId: string; nativeDrag?: boolean }>(),
  { nativeDrag: true }
)
const { state } = useAppStore()
const { saveBookmarks } = useGroups()

const { confirm: dialogConfirm } = useDialog()

const openInNewTab = computed(() => state.config?.openInNewTab ?? true)
const firstChar = computed(() => props.bookmark.name?.[0]?.toUpperCase() || '?')

// 无图标时的字母兜底:按域名哈希生成品牌色渐变,同站同色、不同站不同色
const fallbackBg = computed(() => {
  let host = ''
  try {
    host = new URL(props.bookmark.url).hostname
  } catch {
    host = props.bookmark.url || props.bookmark.name || ''
  }
  let hash = 0
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) >>> 0
  const h = hash % 360
  const h2 = (h + 42) % 360
  return `linear-gradient(135deg, hsl(${h} 68% 56%), hsl(${h2} 68% 42%))`
})

// 优先使用自定义图标,否则走 favicon 服务
const iconSrc = ref(props.bookmark.icon || faviconUrl(props.bookmark.url))
const loadFailed = ref(false)
const hasCustomIcon = computed(() => !!props.bookmark.icon)

watch(
  () => [props.bookmark.url, props.bookmark.icon],
  () => {
    iconSrc.value = props.bookmark.icon || faviconUrl(props.bookmark.url)
    loadFailed.value = false
  }
)

function onIconError() {
  // 自定义图标失败则不再降级(用户明确指定了)
  if (hasCustomIcon.value) {
    loadFailed.value = true
    return
  }
  const next = nextFavicon(props.bookmark.url, iconSrc.value)
  if (next) {
    iconSrc.value = next
  } else {
    loadFailed.value = true
  }
}

// 跨分组拖动:记录源分组和书签 id,供顶部分组标签 drop 时移动
const dragging = ref(false)
function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(
    'application/x-bookmark-move',
    JSON.stringify({ bookmarkId: props.bookmark.id, groupId: props.groupId })
  )
  dragging.value = true
}

function onDragEnd() {
  dragging.value = false
}

function onClick() {
  // 异步累计点击数(不影响跳转)
  props.bookmark.clicks = (props.bookmark.clicks || 0) + 1
  saveBookmarks(props.groupId, state.groups.find((g) => g.id === props.groupId)?.bookmarks || []).catch(() => {})
}

// === 右键菜单 ===
const menu = ref<{ x: number; y: string | number } | null>(null)

function openMenu(e: MouseEvent) {
  const MENU_W = 132
  const MENU_H = 118
  menu.value = {
    x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
    y: Math.min(e.clientY, window.innerHeight - MENU_H - 8)
  }
}

function closeMenu() {
  menu.value = null
}

function onGlobalClick(e: MouseEvent) {
  if (menu.value && !(e.target as HTMLElement)?.closest?.('.ctx-menu')) {
    menu.value = null
  }
}

onMounted(() => window.addEventListener('click', onGlobalClick))
onUnmounted(() => window.removeEventListener('click', onGlobalClick))

function onEdit() {
  closeMenu()
  ;(window as any).$openBookmarkEditor?.(props.groupId, props.bookmark)
}

async function onToggleFav() {
  closeMenu()
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
  closeMenu()
  const ok = await dialogConfirm({
    title: '删除书签',
    message: `删除「${props.bookmark.name}」?此操作无法恢复。`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
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
  gap: 4px;
  padding: 8px 4px 6px;
  width: 100%;
  text-decoration: none;
  color: inherit;
  border-radius: var(--radius);
  transition: 0.25s var(--ease);
  will-change: transform;
}

.bookmark-card:hover .card-link {
  background: transparent;
  transform: translateY(-4px);
}

.bookmark-card:active .card-link {
  transform: translateY(-1px) scale(0.98);
}

/* 无边框图标:直接展示站点图标,hover 放大 + 投影 */
.icon-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.25s var(--ease);
}

.bookmark-card:hover .icon-wrap {
  transform: scale(1.08);
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.35));
}

.favicon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
}

.fallback-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  border-radius: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
}

.name {
  font-size: var(--bookmark-font-size, 14px);
  color: var(--bookmark-text, var(--text-primary));
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  font-weight: 500;
}

/* 右键菜单(与侧边栏菜单同风格) */
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
  white-space: nowrap;
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

@media (max-width: 640px) {
  .icon-wrap {
    width: 48px;
    height: 48px;
  }
  .favicon {
    width: 40px;
    height: 40px;
  }
  .fallback-icon {
    width: 40px;
    height: 40px;
    font-size: 18px;
  }
  .name {
    font-size: calc(var(--bookmark-font-size, 14px) - 2px);
  }
}
</style>
