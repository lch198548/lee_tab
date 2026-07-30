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

        <!-- 导入浏览器书签 -->
        <section class="form-section">
          <h4>导入浏览器书签</h4>
          <p class="hint-text">支持 Edge / Chrome 导出的 HTML 书签文件,自动按文件夹创建分组</p>
          <div class="backup-row">
            <label class="btn-small file-btn">
              <UploadIcon /> 选择书签 HTML 文件
              <input type="file" accept=".html,.htm" @change="onImportBookmarksHTML" hidden />
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
import { useGroups } from '@/composables/useGroups'
import {
  CloseIcon,
  TrashIcon,
  DownloadIcon,
  UploadIcon
} from './icons'

const emit = defineEmits<{ (e: 'close'): void }>()

const { state } = useAppStore()
const { saveConfig, loadConfig } = useConfig()
const { loadGroups: reloadGroups, createGroup, addBookmark } = useGroups()

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
    await loadConfig()
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    ;(window as any).$toast?.((err as Error).message, 'error')
  }
}

// === 导入 Chrome/Edge HTML 书签 ===
interface BookmarkNode {
  name: string
  type: 'folder' | 'bookmark'
  url?: string
  children?: BookmarkNode[]
}

function parseBookmarksHTML(html: string): BookmarkNode[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function walkNode(node: Element): BookmarkNode[] {
    const result: BookmarkNode[] = []
    // DTL 标签:书签文件夹
    const dts = node.querySelectorAll(':scope > dt')
    for (const dt of Array.from(dts)) {
      const h3 = dt.querySelector(':scope > h3')
      const anchor = dt.querySelector(':scope > a')
      if (anchor) {
        // 书签节点
        result.push({
          name: anchor.textContent?.trim() || '未命名',
          type: 'bookmark',
          url: anchor.getAttribute('href') || ''
        })
      } else if (h3) {
        // 文件夹节点
        const folderName = h3.textContent?.trim() || '未命名文件夹'
        // 找到对应的 DD 节点
        const dd = dt.nextElementSibling
        const children: BookmarkNode[] = []
        if (dd && dd.tagName === 'DD') {
          // DD 内可能包含 DL > DT 结构
          const innerDls = dd.querySelectorAll(':scope > dl')
          for (const dl of Array.from(innerDls)) {
            children.push(...walkNode(dl))
          }
          // DD 内可能直接包含 DT (某些导出格式)
          const innerDts = dd.querySelectorAll(':scope > dt')
          for (const innerDt of Array.from(innerDts)) {
            const a = innerDt.querySelector(':scope > a')
            if (a) {
              children.push({
                name: a.textContent?.trim() || '未命名',
                type: 'bookmark',
                url: a.getAttribute('href') || ''
              })
            }
          }
        }
        result.push({ name: folderName, type: 'folder', children })
      }
    }
    return result
  }

  // 找到根 DL
  const rootDl = doc.querySelector('dl')
  if (!rootDl) return []
  return walkNode(rootDl)
}

async function onImportBookmarksHTML(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!confirm('将导入书签,按文件夹自动创建分组。是否继续?')) return

  try {
    const html = await file.text()
    const tree = parseBookmarksHTML(html)
    if (tree.length === 0) {
      ;(window as any).$toast?.('未解析到任何书签', 'error')
      return
    }

    let groupCount = 0
    let bookmarkCount = 0

    async function importFolder(node: BookmarkNode, defaultFolderId?: string) {
      if (node.type === 'bookmark' && node.url) {
        if (!defaultFolderId) return
        await addBookmark(defaultFolderId, {
          name: node.name,
          url: node.url,
          favorite: false
        })
        bookmarkCount++
      } else if (node.type === 'folder' && node.children) {
        // 跳过顶层 "书签栏" / "Other Bookmarks" 等默认文件夹
        const skipNames = ['书签栏', '其他书签', 'Bookmarks Bar', 'Other Bookmarks', 'Mobile Bookmarks', '移动书签']
        if (!defaultFolderId && skipNames.includes(node.name)) {
          for (const child of node.children) {
            await importFolder(child)
          }
          return
        }
        // 创建分组
        const res = await createGroup(node.name || '导入分组')
        groupCount++
        const folderId = res.group.id
        // 递归导入子节点
        for (const child of node.children) {
          await importFolder(child, folderId)
        }
      }
    }

    for (const rootNode of tree) {
      await importFolder(rootNode)
    }

    await reloadGroups()
    ;(window as any).$toast?.(`导入完成: ${groupCount} 个分组, ${bookmarkCount} 个书签`, 'success')
    emit('close')
  } catch (err) {
    console.error(err)
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

.hint-text {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 10px;
  line-height: 1.5;
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
