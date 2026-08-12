<template>
  <div class="todo-modal-overlay" @click.self="close">
    <div class="todo-modal" @click.self="close">
      <input
        ref="inputRef"
        v-model="text"
        class="todo-input"
        type="text"
        placeholder="输入待办任务..."
        @keydown.enter="submit"
        @keydown.esc="close"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

const emit = defineEmits<{
  (e: 'submit', text: string): void
  (e: 'close'): void
}>()

const text = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus()
  })
})

function submit() {
  const t = text.value.trim()
  if (!t) {
    close()
    return
  }
  emit('submit', t)
  text.value = ''
  // 保持打开,继续输入下一个
  nextTick(() => inputRef.value?.focus())
}

function close() {
  emit('close')
}
</script>

<style scoped>
.todo-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.todo-modal {
  width: 460px;
  max-width: 90vw;
}

.todo-input {
  width: 100%;
  padding: 16px 20px;
  font-size: 18px;
  border: none;
  outline: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  color: #1e293b;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  font-family: inherit;
}

.todo-input::placeholder {
  color: #94a3b8;
}
</style>
