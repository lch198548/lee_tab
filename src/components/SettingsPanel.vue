<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h3>设置</h3>
        <button class="icon-btn" @click="$emit('close')"><CloseIcon /></button>
      </header>

      <div class="modal-body">
        <!-- 基础设置 -->
        <section class="form-section">
          <h4>基础</h4>
          <label class="form-row">
            <span>页面标题</span>
            <input v-model="form.title" type="text" />
          </label>
          <label class="form-row">
            <span>新标签打开</span>
            <input v-model="form.openInNewTab" type="checkbox" class="checkbox" />
          </label>
        </section>

        <!-- 主题 -->
        <section class="form-section">
          <h4>主题</h4>
          <div class="radio-row">
            <label v-for="t in themes" :key="t.value">
              <input v-model="form.theme" :value="t.value" type="radio" name="theme" />
              {{ t.label }}
            </label>
          </div>
        </section>

        <!-- 背景 -->
        <section class="form-section">
          <h4>背景</h4>
          <div class="radio-row">
            <label v-for="b in bgTypes" :key="b.value">
              <input v-model="form.background.type" :value="b.value" type="radio" name="bg-type" />
              {{ b.label }}
            </label>
          </div>
          <label class="form-row" v-if="form.background.type === 'color'">
            <span>颜色</span>
            <input v-model="form.background.value" type="color" />
          </label>
          <label class="form-row" v-else>
            <span>{{ form.background.type === 'image' ? '图片 URL' : 'CSS 渐变' }}</span>
            <textarea v-model="form.background.value" rows="2"
              :placeholder="form.background.type === 'image' ? 'https://...' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'">
            </textarea>
          </label>

          <!-- 背景图专属:模糊值 + 遮罩透明度 -->
          <template v-if="form.background.type === 'image'">
            <label class="form-row">
              <span>背景模糊 ({{ form.backgroundBlur || 0 }}px)</span>
              <input
                v-model.number="form.backgroundBlur"
                type="range"
                min="0"
                max="30"
                step="1"
                class="range"
              />
            </label>
            <label class="form-row">
              <span>遮罩透明度 ({{ Math.round((form.backgroundMask ?? 0) * 100) }}%)</span>
              <input
                v-model.number="form.backgroundMask"
                type="range"
                min="0"
                max="0.9"
                step="0.05"
                class="range"
              />
            </label>
          </template>
        </section>

        <!-- 搜索引擎 -->
        <section class="form-section">
          <h4>搜索引擎</h4>
          <label class="form-row">
            <span>默认引擎</span>
            <select v-model="form.defaultEngine">
              <option v-for="e in form.engines" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </label>

          <div class="engines-list">
            <div v-for="(e, i) in form.engines" :key="i" class="engine-row">
              <input v-model="e.name" type="text" placeholder="名称" />
              <input v-model="e.url" type="text" placeholder="URL 模板(以=结尾)" />
              <input v-model="e.id" type="text" placeholder="ID" />
              <button class="mini-btn danger" @click="form.engines.splice(i, 1)">
                <TrashIcon />
              </button>
            </div>
            <button class="btn-small" @click="addEngine">+ 添加引擎</button>
          </div>
        </section>

        <!-- 备份 -->
        <section class="form-section">
          <h4>备份</h4>
          <div class="backup-row">
            <button class="btn-small" @click="onExport">
              <DownloadIcon /> 导出 JSON
            </button>
            <label class="btn-small file-btn">
              <UploadIcon /> 导入 JSON
              <input type="file" accept="application/json" @change="onImportFile" hidden />
            </label>
          </div>
        </section>
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
import { reactive, ref, watch } from 'vue'
import { api, type AppConfig } from '@/api'
import { useAppStore } from '@/stores/app'
import { useConfig } from '@/composables/useConfig'
import {
  CloseIcon,
  TrashIcon,
  DownloadIcon,
  UploadIcon
} from './icons'

const emit = defineEmits<{ (e: 'close'): void }>()

const { state } = useAppStore()
const { saveConfig, loadConfig } = useConfig()

const form = reactive<AppConfig>(JSON.parse(JSON.stringify(state.config || {
  title: '我的导航',
  background: { type: 'color', value: '#1f2937' },
  backgroundBlur: 0,
  backgroundMask: 0.35,
  theme: 'dark',
  defaultEngine: 'baidu',
  engines: [],
  openInNewTab: true
})))

// 兼容老数据:补齐新字段
if (typeof form.backgroundBlur !== 'number') form.backgroundBlur = 0
if (typeof form.backgroundMask !== 'number') form.backgroundMask = 0.35

// 切换背景类型时重置 value,避免旧类型的值残留
watch(
  () => form.background.type,
  (newType, oldType) => {
    if (newType !== oldType) {
      if (newType === 'color') {
        form.background.value = '#1f2937'
      } else {
        form.background.value = ''
      }
    }
  }
)

const themes = [
  { value: 'dark' as const, label: '深色' },
  { value: 'light' as const, label: '浅色' },
  { value: 'auto' as const, label: '跟随系统' }
]
const bgTypes = [
  { value: 'color' as const, label: '纯色' },
  { value: 'gradient' as const, label: '渐变' },
  { value: 'image' as const, label: '图片' }
]

const saving = ref(false)

function addEngine() {
  form.engines.push({ id: 'engine_' + Date.now(), name: '', url: '' })
}

async function onSave() {
  saving.value = true
  try {
    await saveConfig(form as any)
    ;(window as any).$toast?.('设置已保存', 'success')
    emit('close')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function onExport() {
  try {
    const text = await api.exportBackup()
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nav-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ;(window as any).$toast?.('导出成功', 'success')
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!confirm('导入将覆盖当前所有数据,确定继续?')) return
  try {
    const text = await file.text()
    await api.importBackup(text)
    ;(window as any).$toast?.('导入成功,刷新数据中...', 'success')
    // 刷新配置
    await loadConfig()
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    ;(window as any).$toast?.((err as Error).message, 'error')
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
  max-width: 640px;
  max-height: 85vh;
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
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-section {
  margin-bottom: 24px;
}

.form-section h4 {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 14px;
}

.form-row > span {
  flex-shrink: 0;
  min-width: 80px;
}

.form-row input[type='text'],
.form-row select,
.form-row textarea {
  flex: 1;
}

.form-row input[type='color'] {
  width: 60px;
  height: 32px;
  padding: 2px;
  cursor: pointer;
}

.range {
  flex: 1;
  height: 6px;
  padding: 0;
  background: var(--bg-input);
  border-radius: 999px;
  border: none;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}

.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid #fff;
}

.checkbox {
  width: 18px;
  height: 18px;
}

.radio-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 14px;
}

.radio-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.engines-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.engine-row {
  display: grid;
  grid-template-columns: 100px 1fr 100px 32px;
  gap: 6px;
}

.engine-row input {
  padding: 6px 10px;
  font-size: 13px;
}

.btn-small {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  align-self: flex-start;
}

.btn-small:hover {
  background: var(--bg-card-hover);
}

.file-btn {
  position: relative;
  cursor: pointer;
}

.backup-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.mini-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--text-secondary);
}

.mini-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.mini-btn.danger:hover {
  color: var(--danger);
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

@media (max-width: 640px) {
  .engine-row {
    grid-template-columns: 1fr;
  }
}
</style>
