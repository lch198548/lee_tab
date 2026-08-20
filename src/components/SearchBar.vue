<template>
  <div class="search-wrap">
    <div class="engine-tabs">
      <button
        v-for="e in engines"
        :key="e.id"
        class="engine-tab"
        :class="{ active: e.id === engineId }"
        @click="onPickEngine(e.id)"
        type="button"
      >
        {{ e.name }}
      </button>
    </div>
    <div class="search-box glass-strong">
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { SearchIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useConfig } from '@/composables/useConfig'

const { state } = useAppStore()
const { saveConfig } = useConfig()

const engines = computed(() => state.config?.engines || [])
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

function onPickEngine(id: string) {
  engineId.value = id
  // 切换引擎后聚焦输入框
  nextTick(() => inputRef.value?.focus())
  // 记忆选择
  if (id !== state.config?.defaultEngine) {
    saveConfig({ defaultEngine: id } as any).catch(() => {})
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
  // 自动聚焦搜索框
  nextTick(() => inputRef.value?.focus())
})
</script>

<style scoped>
.search-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.engine-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.engine-tab {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--search-tab-text);
  background: var(--search-tab-default-bg);
  border: 1px solid transparent;
  transition: var(--transition);
  cursor: pointer;
  white-space: nowrap;
}

.engine-tab:hover {
  color: var(--text-primary);
  background: var(--bg-card);
}

.engine-tab.active {
  color: var(--search-tab-active-text);
  background: var(--search-tab-active-bg);
  border-color: var(--search-tab-active-bg);
}

.search-box {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 640px;
  border-radius: 999px;
  padding: 6px 6px 6px 24px;
  box-shadow: var(--shadow-lg);
  background: var(--search-bg);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--border-strong);
}

.search-box input {
  flex: 1;
  min-width: 0;
  padding: 14px 8px;
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
  width: 52px;
  height: 52px;
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
  width: 22px;
  height: 22px;
}

@media (max-width: 640px) {
  .search-box {
    max-width: 100%;
    padding: 4px 4px 4px 18px;
  }
  .search-box input {
    padding: 10px 6px;
    font-size: 15px;
  }
  .search-btn {
    width: 44px;
    height: 44px;
  }
  .search-btn svg {
    width: 18px;
    height: 18px;
  }
  .engine-tab {
    padding: 5px 12px;
    font-size: 12px;
  }
}
</style>
