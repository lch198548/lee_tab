<template>
  <div class="search-bar">
    <select v-model="engineId" class="engine-select" :title="'搜索引擎'">
      <option v-for="e in engines" :key="e.id" :value="e.id">{{ e.name }}</option>
    </select>
    <input
      v-model="keyword"
      type="text"
      :placeholder="`在 ${currentEngine?.name || ''} 中搜索...`"
      @keyup.enter="onSearch"
      autofocus
    />
    <button class="search-btn" @click="onSearch">搜索</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  // 切换引擎时记住选择
  if (engineId.value !== state.config?.defaultEngine) {
    await saveConfig({ defaultEngine: engineId.value } as any)
  }
}
</script>

<style scoped>
.search-bar {
  flex: 1;
  min-width: 280px;
  max-width: 600px;
  display: flex;
  gap: 8px;
}

.engine-select {
  width: 90px;
  padding: 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  flex-shrink: 0;
}

input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
}

.search-btn {
  padding: 10px 20px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-weight: 500;
  flex-shrink: 0;
}

.search-btn:hover {
  background: var(--accent-hover);
}

@media (max-width: 640px) {
  .search-bar {
    order: 3;
    width: 100%;
    max-width: none;
  }
}
</style>
