<template>
  <div class="app-root" :style="backgroundStyle">
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
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import LoginPage from '@/components/LoginPage.vue'
import NavPage from '@/components/NavPage.vue'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import { useConfig } from '@/composables/useConfig'

const { state, loggedIn, loading } = useAppStore()
const { checkLogin } = useAuth()
const { loadConfig, backgroundStyle } = useConfig()

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
  min-height: 100vh;
  width: 100%;
  background-color: var(--bg-page);
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
  background: var(--bg-modal);
  color: var(--text-primary);
  box-shadow: var(--shadow);
  z-index: 9999;
  font-size: 14px;
  max-width: 80vw;
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
