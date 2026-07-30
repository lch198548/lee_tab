<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h3>{{ bookmark ? '编辑书签' : '添加书签' }}</h3>
        <button class="icon-btn" @click="$emit('close')"><CloseIcon /></button>
      </header>

      <div class="modal-body">
        <label class="form-row">
          <span>名称</span>
          <input v-model="form.name" type="text" placeholder="书签名称" />
        </label>
        <label class="form-row">
          <span>URL</span>
          <input v-model="form.url" type="text" placeholder="https://example.com" @blur="onUrlBlur" />
        </label>
        <label class="form-row">
          <span>描述</span>
          <input v-model="form.desc" type="text" placeholder="可选备注" />
        </label>
        <label class="form-row">
          <span>图标 URL</span>
          <input v-model="form.icon" type="text" placeholder="留空使用自动 favicon" />
        </label>
        <label class="form-row checkbox-row">
          <span>设为常用</span>
          <input v-model="form.favorite" type="checkbox" class="checkbox" />
          <small class="hint-text">常用书签会显示在分组顶部</small>
        </label>

        <div class="preview">
          <div class="preview-label">预览:</div>
          <div class="preview-card">
            <div class="icon-wrap">
              <img
                v-if="previewIcon && !previewFailed"
                :src="previewIcon"
                class="favicon"
                referrerpolicy="no-referrer"
                @error="previewFailed = true"
              />
              <div v-else class="fallback-icon">{{ form.name?.[0]?.toUpperCase() || '?' }}</div>
            </div>
            <div class="info">
              <div class="name">{{ form.name || '书签名称' }}</div>
              <div class="desc">{{ form.url || 'https://...' }}</div>
            </div>
          </div>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn-default" @click="$emit('close')">取消</button>
        <button class="btn-primary" :disabled="saving" @click="onSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CloseIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useGroups } from '@/composables/useGroups'
import { faviconUrl } from '@/utils/favicon'
import type { Bookmark } from '@/api'

const props = defineProps<{ groupId: string; bookmark: Bookmark | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { state } = useAppStore()
const { addBookmark, saveBookmarks } = useGroups()

const form = reactive({
  name: props.bookmark?.name || '',
  url: props.bookmark?.url || '',
  desc: props.bookmark?.desc || '',
  icon: props.bookmark?.icon || '',
  favorite: !!props.bookmark?.favorite
})

const saving = ref(false)
const previewFailed = ref(false)

const previewIcon = computed(() => {
  if (form.icon) return form.icon
  return form.url ? faviconUrl(form.url) : ''
})

watch(() => form.url, () => (previewFailed.value = false))
watch(() => form.icon, () => (previewFailed.value = false))

function onUrlBlur() {
  // 自动补全 https:// 前缀
  if (form.url && !/^https?:\/\//.test(form.url)) {
    form.url = 'https://' + form.url
  }
}

async function onSave() {
  if (!form.name.trim() || !form.url.trim()) {
    ;(window as any).$toast?.('名称和 URL 不能为空', 'error')
    return
  }
  saving.value = true
  try {
    if (props.bookmark) {
      // 编辑:更新书签字段
      const g = state.groups.find((x) => x.id === props.groupId)
      if (!g) throw new Error('分组不存在')
      const b = g.bookmarks.find((x) => x.id === props.bookmark!.id)
      if (!b) throw new Error('书签不存在')
      Object.assign(b, {
        name: form.name.trim(),
        url: form.url.trim(),
        desc: form.desc.trim(),
        icon: form.icon.trim(),
        favorite: !!form.favorite
      })
      await saveBookmarks(props.groupId, g.bookmarks)
    } else {
      // 添加
      await addBookmark(props.groupId, {
        name: form.name.trim(),
        url: form.url.trim(),
        desc: form.desc.trim(),
        icon: form.icon.trim(),
        favorite: !!form.favorite
      })
    }
    ;(window as any).$toast?.(props.bookmark ? '已更新' : '已添加', 'success')
    emit('close')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  width: 100%;
  max-width: 480px;
  background: var(--bg-modal);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 20px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
}

.form-row span {
  color: var(--text-secondary);
}

.form-row input {
  width: 100%;
  padding: 10px 12px;
}

.checkbox-row {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.checkbox-row .checkbox {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.checkbox-row .hint-text {
  color: var(--text-muted);
  font-size: 12px;
  flex: 1;
}

.preview {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
}

.preview-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.preview-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
}

.icon-wrap {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.favicon {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: contain;
}

.fallback-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.info {
  min-width: 0;
}

.name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.btn-default,
.btn-primary {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
}

.btn-default {
  background: var(--bg-input);
  color: var(--text-primary);
}

.btn-default:hover {
  background: var(--bg-card-hover);
}

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-secondary);
}

.icon-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}
</style>
