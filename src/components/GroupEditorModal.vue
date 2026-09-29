<template>
  <div class="group-editor-mask" @click.self="$emit('close')">
    <div class="group-editor modal-skin">
      <header class="ge-header">
        <h3>{{ isEdit ? '编辑分组' : '添加分组' }}</h3>
        <button class="ge-close" @click="$emit('close')"><CloseIcon /></button>
      </header>

      <div class="ge-body">
        <label class="ge-row">
          <span class="ge-label">分组名称</span>
          <input
            ref="nameInput"
            v-model="name"
            type="text"
            maxlength="20"
            placeholder="例如:开发工具 / 常用网站"
            @keydown.enter="onSave"
          />
        </label>

        <div class="ge-row">
          <span class="ge-label">分组图标</span>
          <div class="icon-grid">
            <button
              v-for="ic in GROUP_ICONS"
              :key="ic.id"
              type="button"
              class="icon-cell"
              :class="{ active: icon === ic.id }"
              :title="ic.label"
              @click="icon = ic.id"
            >
              <GroupIcon :icon="ic.id" :size="18" />
            </button>
          </div>
        </div>
      </div>

      <footer class="ge-footer">
        <button class="ge-btn" @click="$emit('close')">取消</button>
        <button class="ge-btn primary" :disabled="saving || !name.trim()" @click="onSave">
          {{ saving ? '保存中...' : isEdit ? '保存' : '创建' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { Group } from '@/api'
import { GROUP_ICONS } from './groupIcons'
import GroupIcon from './GroupIcon.vue'
import { CloseIcon } from './icons'
import { useGroups } from '@/composables/useGroups'

const props = defineProps<{ group: Group | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', group: Group): void }>()

const { createGroup, updateGroup } = useGroups()

const isEdit = !!props.group
const name = ref(props.group?.name || '')
const icon = ref(props.group?.icon || GROUP_ICONS[0].id)
const saving = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => nameInput.value?.focus())
})

async function onSave() {
  const n = name.value.trim()
  if (!n || saving.value) return
  saving.value = true
  try {
    if (isEdit && props.group) {
      await updateGroup(props.group.id, { name: n, icon: icon.value })
      emit('saved', { ...props.group, name: n, icon: icon.value })
    } else {
      const res = await createGroup(n, icon.value)
      emit('saved', res.group)
    }
    ;(window as any).$toast?.(isEdit ? '分组已更新' : '分组已创建', 'success')
    emit('close')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.group-editor-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  animation: geFade 0.2s var(--ease);
}

@keyframes geFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.group-editor {
  width: 360px;
  max-width: 92vw;
  background: var(--bg-modal);
  backdrop-filter: blur(36px) saturate(1.7);
  -webkit-backdrop-filter: blur(36px) saturate(1.7);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: gePop 0.22s var(--ease);
}

@keyframes gePop {
  from { opacity: 0; transform: scale(0.94) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.ge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.ge-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.ge-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.ge-close:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.ge-close svg {
  width: 15px;
  height: 15px;
}

.ge-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ge-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ge-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.ge-row input[type='text'] {
  height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: var(--transition);
}

.ge-row input[type='text']:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
}

.icon-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid transparent;
  color: var(--text-secondary);
  transition: 0.15s var(--ease);
}

.icon-cell:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.icon-cell.active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}

.icon-cell svg {
  width: 18px;
  height: 18px;
}

.ge-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 18px;
}

.ge-btn {
  height: 34px;
  padding: 0 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-card-hover);
  transition: var(--transition);
}

.ge-btn:hover {
  filter: brightness(1.1);
}

.ge-btn.primary {
  background: var(--accent);
  color: #fff;
}

.ge-btn.primary:hover {
  background: var(--accent-hover);
}

.ge-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
