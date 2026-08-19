<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="logo">
        <svg viewBox="0 0 32 32" width="48" height="48">
          <rect width="32" height="32" rx="6" fill="currentColor" />
          <rect x="6" y="6" width="8" height="8" rx="1.5" fill="#fff" opacity="0.9" />
          <rect x="18" y="6" width="8" height="8" rx="1.5" fill="#fff" opacity="0.7" />
          <rect x="6" y="18" width="8" height="8" rx="1.5" fill="#fff" opacity="0.7" />
          <rect x="18" y="18" width="8" height="8" rx="1.5" fill="#fff" opacity="0.9" />
        </svg>
      </div>
      <h1 class="title">{{ state.config?.title || '个人导航' }}</h1>
      <p class="hint">
        {{ firstSetup ? '首次使用,请设置你的访问密码' : '请输入访问密码' }}
      </p>

      <form @submit.prevent="onSubmit">
        <input
          v-model="password"
          type="password"
          :placeholder="firstSetup ? '设置密码(至少 4 位)' : '访问密码'"
          autofocus
          autocomplete="current-password"
        />
        <input
          v-if="firstSetup"
          v-model="confirmPassword"
          type="password"
          placeholder="再次输入以确认"
          autocomplete="new-password"
        />

        <button type="submit" :disabled="submitting">
          {{ submitting ? '登录中...' : firstSetup ? '设置并登录' : '登录' }}
        </button>
      </form>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuth } from '@/composables/useAuth'
import { api } from '@/api'

const { state } = useAppStore()
const { login } = useAuth()

const password = ref('')
const confirmPassword = ref('')
const errorMsg = ref('')
const submitting = ref(false)
const firstSetup = ref(false)

// 进入登录页时检测是否已设置密码
;(async () => {
  try {
    const res = await fetch('/api/auth/check').then((r) => r.json())
    if (res.loggedIn) {
      // 已登录,App.vue 会自动跳转到主界面
      return
    }
    // passwordSet = false 表示首次使用,需设置密码
    firstSetup.value = res.passwordSet === false
  } catch {
    // 接口异常时默认当作首次,更安全
    firstSetup.value = true
  }
})()

async function onSubmit() {
  errorMsg.value = ''
  if (password.value.length < 4) {
    errorMsg.value = '密码至少 4 位'
    return
  }
  if (firstSetup.value && password.value !== confirmPassword.value) {
    errorMsg.value = '两次密码不一致'
    return
  }

  submitting.value = true
  try {
    const res = await login(password.value)
    firstSetup.value = res.firstSetup
    // 登录成功后通过 init 接口加载配置和分组
    const init = await api.getInit()
    if (init.config) state.config = init.config
    state.groups = init.groups
  } catch (e) {
    errorMsg.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 360px;
  background: var(--bg-modal);
  border-radius: var(--radius);
  padding: 36px 28px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border-color);
}

.logo {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  color: var(--accent);
}

.title {
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 8px;
}

.hint {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 24px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

input {
  width: 100%;
  padding: 12px 14px;
}

button {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 500;
}

button:hover:not(:disabled) {
  background: var(--accent-hover);
}

.error {
  color: var(--danger);
  font-size: 13px;
  margin-top: 12px;
  text-align: center;
}
</style>
