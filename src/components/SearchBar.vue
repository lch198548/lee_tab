<template>
  <div class="search-wrap" ref="wrapRef">
    <div class="search-box glass-strong">
      <!-- 引擎切换入口:favicon + 箭头 -->
      <button class="engine-trigger" type="button" @click="panelOpen = !panelOpen" title="切换搜索引擎">
        <img v-if="engineFavicon" :src="engineFavicon" class="engine-favicon" alt="" @error="faviconError = true" />
        <SearchIcon v-else class="engine-fallback" />
        <ChevronDownIcon class="chevron" :class="{ open: panelOpen }" />
      </button>

      <input
        v-model="keyword"
        type="text"
        :placeholder="`在 ${currentEngine?.name || '搜索引擎'} 中搜索...`"
        @keyup.enter="onSearch"
        ref="inputRef"
        autofocus
      />
      <button class="search-btn" type="button" @click="onSearch" :title="`使用${currentEngine?.name || ''}搜索`">
        <SearchIcon />
      </button>
    </div>

    <!-- 引擎切换面板 -->
    <Transition name="panel">
      <div v-if="panelOpen" class="engine-panel glass-strong">
        <button
          v-for="e in engines"
          :key="e.id"
          class="engine-cell"
          :class="{ active: e.id === engineId }"
          type="button"
          @click="onPickEngine(e.id)"
        >
          <span class="engine-cell-icon">
            <img v-if="faviconOf(e)" :src="faviconOf(e)" alt="" @error="onCellImgError" />
            <SearchIcon v-else />
          </span>
          <span class="engine-cell-name">{{ e.name || e.id }}</span>
        </button>

        <!-- 添加引擎:打开设置 -->
        <button class="engine-cell add" type="button" @click="onOpenSettings" title="在设置中管理搜索引擎">
          <span class="engine-cell-icon"><PlusIcon /></span>
          <span class="engine-cell-name">添加</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { SearchIcon, ChevronDownIcon, PlusIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useConfig } from '@/composables/useConfig'

interface Engine {
  id: string
  name: string
  url: string
}

const { state } = useAppStore()
const { saveConfig } = useConfig()

const engines = computed<Engine[]>(() => state.config?.engines || [])
const engineId = ref(state.config?.defaultEngine || 'baidu')

// 配置加载后同步当前引擎
watch(
  () => state.config?.defaultEngine,
  (v) => {
    if (v) engineId.value = v
  }
)

const currentEngine = computed(() => engines.value.find((e) => e.id === engineId.value))
const keyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// === 引擎 favicon(走服务端代理缓存) ===
const faviconError = ref(false)
const panelOpen = ref(false)

function domainOf(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function faviconOf(e?: Engine): string {
  const d = domainOf(e?.url)
  return d ? `/api/favicon?u=${encodeURIComponent(d)}` : ''
}

const engineFavicon = computed(() => {
  if (faviconError.value) return ''
  return faviconOf(currentEngine.value)
})

// 切换引擎后重置错误状态
watch(engineId, () => {
  faviconError.value = false
})

function onCellImgError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

function onPickEngine(id: string) {
  engineId.value = id
  panelOpen.value = false
  // 切换引擎后聚焦输入框
  nextTick(() => inputRef.value?.focus())
  // 记忆选择
  if (id !== state.config?.defaultEngine) {
    saveConfig({ defaultEngine: id } as any).catch(() => {})
  }
}

function onOpenSettings() {
  panelOpen.value = false
  state.settingsOpen = true
}

// 点击面板外关闭
const wrapRef = ref<HTMLElement | null>(null)
function onGlobalClick(e: MouseEvent) {
  if (panelOpen.value && wrapRef.value && !wrapRef.value.contains(e.target as Node)) {
    panelOpen.value = false
  }
}

async function onSearch() {
  const kw = keyword.value.trim()
  if (!kw) return
  const engine = currentEngine.value
  if (!engine) return
  const url = engine.url + encodeURIComponent(kw)
  if (state.config?.openInNewTab) {
    window.open(url, '_blank', 'noopener')
  } else {
    window.location.href = url
  }
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
  nextTick(() => inputRef.value?.focus())
})

onUnmounted(() => {
  document.removeEventListener('click', onGlobalClick)
})
</script>

<style scoped>
.search-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.search-box {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 640px;
  border-radius: 999px;
  padding: 6px 6px 6px 10px;
  box-shadow: var(--shadow-lg);
  background: var(--search-bg);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--border-strong);
  transition: 0.25s var(--ease);
}

.search-box:focus-within {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent);
}

/* 引擎切换入口 */
.engine-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 999px;
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: var(--transition);
}

.engine-trigger:hover {
  background: var(--bg-card-hover);
}

.engine-favicon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: contain;
}

.engine-fallback {
  width: 20px;
  height: 20px;
}

.chevron {
  width: 14px;
  height: 14px;
  transition: transform 0.2s var(--ease);
}

.chevron.open {
  transform: rotate(180deg);
}

.search-box input {
  flex: 1;
  min-width: 0;
  padding: 12px 8px;
  font-size: 16px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--search-text);
}

.search-box input::placeholder {
  color: var(--search-placeholder);
}

.search-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--search-btn-bg);
  color: var(--search-btn-icon);
  flex-shrink: 0;
  cursor: pointer;
  transition: var(--transition);
}

.search-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.search-btn svg {
  width: 20px;
  height: 20px;
}

/* 引擎切换面板 */
.engine-panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(4, 84px);
  gap: 4px;
  padding: 12px 10px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  z-index: 200;
}

.panel-enter-active,
.panel-leave-active {
  transition: 0.18s var(--ease);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px) scale(0.97);
}

.engine-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  transition: 0.15s var(--ease);
}

.engine-cell:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.engine-cell.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.engine-cell.add {
  color: var(--text-secondary);
}

.engine-cell-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.engine-cell-icon img {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  object-fit: contain;
}

.engine-cell-icon svg {
  width: 22px;
  height: 22px;
}

.engine-cell-name {
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

@media (max-width: 640px) {
  .search-box {
    max-width: 100%;
    padding: 4px 4px 4px 8px;
  }
  .search-box input {
    padding: 10px 6px;
    font-size: 15px;
  }
  .search-btn {
    width: 42px;
    height: 42px;
  }
  .search-btn svg {
    width: 18px;
    height: 18px;
  }
  .engine-panel {
    grid-template-columns: repeat(4, 76px);
  }
}
</style>
