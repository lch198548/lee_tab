<template>
  <Teleport to="body">
    <div v-if="dialog.open" class="dlg-mask" @click.self="finish(null)">
      <div class="dlg modal-skin">
        <h3 class="dlg-title" :class="{ danger: dialog.danger }">{{ dialog.title }}</h3>
        <p v-if="dialog.mode === 'confirm' && dialog.message" class="dlg-message">
          {{ dialog.message }}
        </p>
        <input
          v-if="dialog.mode === 'input'"
          ref="inputRef"
          v-model="dialog.value"
          class="dlg-input"
          type="text"
          :placeholder="dialog.placeholder"
          maxlength="200"
          @keydown.enter="finish(dialog.value)"
          @keydown.esc.stop="finish(null)"
        />
        <footer class="dlg-actions">
          <button class="dlg-btn" @click="finish(null)">{{ dialog.cancelText }}</button>
          <button
            class="dlg-btn primary"
            :class="{ danger: dialog.danger }"
            @click="dialog.mode === 'input' ? finish(dialog.value) : finish('ok')"
          >
            {{ dialog.confirmText }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDialog } from '@/composables/useDialog'

const { dialog, finish } = useDialog()
const inputRef = ref<HTMLInputElement | null>(null)

// 输入模式打开时自动聚焦全选
watch(
  () => [dialog.open, dialog.mode] as const,
  ([open, mode]) => {
    if (open && mode === 'input') {
      nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    }
  }
)

// ESC 关闭(输入框内已用 .stop 处理,这里兜底 confirm 模式)
function onKeydown(e: KeyboardEvent) {
  if (!dialog.open || e.key !== 'Escape') return
  finish(null)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.dlg-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: dlgFade 0.16s ease;
}

@keyframes dlgFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dlg {
  width: 380px;
  max-width: calc(100vw - 40px);
  border-radius: 16px;
  padding: 20px 20px 16px;
  background: var(--bg-modal);
  animation: dlgPop 0.18s var(--ease);
}

@keyframes dlgPop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dlg-title {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.dlg-title.danger {
  color: var(--danger);
}

.dlg-message {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.dlg-input {
  width: 100%;
  margin-top: 14px;
  padding: 9px 12px;
  font-size: 13.5px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.dlg-input:focus {
  border-color: var(--accent);
}

.dlg-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dlg-btn {
  padding: 7px 18px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-input);
  transition: 0.15s var(--ease);
}

.dlg-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.dlg-btn.primary {
  color: #fff;
  background: var(--accent);
}

.dlg-btn.primary:hover {
  background: var(--accent-hover);
  color: #fff;
}

.dlg-btn.primary.danger {
  background: var(--danger);
}

.dlg-btn.primary.danger:hover {
  background: color-mix(in srgb, var(--danger) 85%, #000);
}
</style>
