<template>
  <div class="app-root">
    <!-- 背景层: 支持模糊和遮罩 -->
    <div class="bg-layer" :style="backgroundLayerStyle"></div>
    <div
      v-if="backgroundMaskAlpha > 0"
      class="bg-mask"
      :style="{ backgroundColor: `rgba(0,0,0,${backgroundMaskAlpha})` }"
    ></div>
    <div
      v-if="backgroundBlurPx > 0"
      class="bg-blur"
      :style="blurStyle"
    ></div>

    <!-- 内容层 -->
    <div class="content-layer">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>

      <LoginPage v-else-if="!loggedIn" />
      <NavPage v-else />

      <transition name="fade">
        <div v-if="toast.show" class="toast" :class="toast.type">{{ toast.message }}</div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, computed } from 'vue'
import LoginPage from '@/components/LoginPage.vue'
import NavPage from '@/components/NavPage.vue'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import { useConfig } from '@/composables/useConfig'

const { state, loggedIn, loading } = useAppStore()
const { checkLogin } = useAuth()
const { loadConfig, backgroundLayerStyle, backgroundBlurPx, backgroundMaskAlpha } = useConfig()

// 背景模糊样式(backdrop-filter + webkit 前缀)
const blurStyle = computed(() => ({
  backdropFilter: `blur(${backgroundBlurPx.value}px)`,
  WebkitBackdropFilter: `blur(${backgroundBlurPx.value}px)`
}))

const toast = reactive({ show: false, message: '', type: 'info', timer: 0 })

function showToast(message: string, type: 'info' | 'error' | 'success' = 'info') {
  toast.message = message
  toast.type = type
  toast.show = true
  if (toast.timer) window.clearTimeout(toast.timer)
  toast.timer = window.setTimeout(() => (toast.show = false), 2400)
}

// 暴露给全局,便于其他组件调用
;(window as any).$toast = showToast

onMounted(async () => {
  await checkLogin()
  if (state.loggedIn) {
    try {
      await loadConfig()
    } catch (e) {
      showToast((e as Error).message, 'error')
    }
  }

  // 监听未登录事件
  window.addEventListener('auth:unauthorized', () => {
    state.loggedIn = false
    state.config = null
    state.groups = []
  })
})
</script>

<style scoped>
.app-root {
  position: relative;
  min-height: 100vh;
  width: 100%;
  overflow: hidden;
}

.bg-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: var(--bg-page);
}

.bg-mask {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.bg-blur {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: transparent;
}

.content-layer {
  position: relative;
  z-index: 10;
  min-height: 100vh;
}

.loading {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-glass-strong);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: var(--text-primary);
  box-shadow: var(--shadow);
  z-index: 9999;
  font-size: 14px;
  max-width: 80vw;
  border: 1px solid var(--border-strong);
}

.toast.error {
  border-left: 4px solid var(--danger);
}

.toast.success {
  border-left: 4px solid var(--success);
}

.toast.info {
  border-left: 4px solid var(--accent);
}
</style>
