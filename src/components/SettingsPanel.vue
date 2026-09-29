<template>
  <div class="drawer-mask" @click.self="$emit('close')">
    <aside class="drawer modal-skin">
      <header class="modal-header">
        <h3>设置</h3>
        <button class="icon-btn" @click="$emit('close')"><CloseIcon /></button>
      </header>

      <div class="sp-layout">
        <!-- 左侧菜单 -->
        <nav class="sp-menu">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="sp-menu-item"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <!-- 右侧内容 -->
        <div class="modal-body sp-body">
        <!-- 基础设置 -->
        <section class="form-section" v-show="activeTab === 'general'">
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

        <section class="form-section" v-show="activeTab === 'general'">
          <h4>账号</h4>
          <div class="form-row">
            <span>登录状态</span>
            <button class="btn-logout" type="button" @click="onLogout">
              <LogoutIcon /> 退出登录
            </button>
          </div>
        </section>

        <!-- 背景 -->
        <section class="form-section" v-show="activeTab === 'wallpaper'">
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
          <label class="form-row" v-else-if="form.background.type === 'bing'">
            <span>必应每日一图,点击下方可固定某天,留空则自动更新</span>
          </label>
          <label class="form-row" v-else>
            <span>{{ form.background.type === 'image' ? '图片 URL' : form.background.type === 'video' ? '视频 URL' : 'CSS 渐变' }}</span>
            <textarea v-model="form.background.value" rows="2"
              :placeholder="form.background.type === 'image' ? 'https://...jpg' : form.background.type === 'video' ? 'https://...mp4' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'">
            </textarea>
          </label>

          <!-- 壁纸图库(多源):选"图片/每日一图"时显示;点击直接应用 -->
          <div v-if="['image', 'bing'].includes(form.background.type)" class="wp-gallery-wrap">
            <div class="wp-toolbar">
              <div class="wp-tabs">
                <button
                  v-for="s in WP_SOURCES"
                  :key="s.id"
                  type="button"
                  class="wp-tab"
                  :class="{ active: wpSource === s.id }"
                  @click="wpSource = s.id"
                >
                  {{ s.label }}
                </button>
              </div>
              <div class="wp-actions">
                <div v-if="wpSource === 'wallhaven'" class="wp-search">
                  <input
                    v-model="wpQ"
                    type="text"
                    placeholder="搜索关键词,如 nature / city"
                    @keyup.enter="reloadGallery"
                  />
                  <button type="button" class="wp-btn" @click="reloadGallery">搜索</button>
                </div>
                <button type="button" class="wp-btn" :disabled="wpLoading" @click="nextPage">换一批</button>
              </div>
            </div>

            <p v-if="wpLoading && !wpItems.length" class="gallery-hint">图库加载中...</p>
            <p v-else-if="wpError" class="gallery-hint">图库加载失败,请稍后重试或切换其他源</p>
            <template v-else>
              <div class="wallpaper-gallery">
                <button
                  v-for="w in wpItems"
                  :key="w.id"
                  type="button"
                  class="wallpaper-thumb"
                  :class="{ active: form.background.value === w.url }"
                  :title="w.title"
                  @click="onPickWallpaper(w)"
                >
                  <img :src="w.thumb" :alt="w.title" loading="lazy" referrerpolicy="no-referrer" />
                  <span class="wp-thumb-title">{{ w.title }}</span>
                </button>
              </div>
              <p class="gallery-hint">点击任意图片立即应用为背景;Wallhaven 源在境内可能需要网络环境</p>
            </template>
          </div>

          <!-- 背景图/视频/必应壁纸专属:模糊值 + 遮罩透明度 -->
          <template v-if="['image', 'video', 'bing'].includes(form.background.type)">
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
        <section class="form-section" v-show="activeTab === 'search'">
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
        <section class="form-section" v-show="activeTab === 'backup'">
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

        <!-- 插件 -->
        <section class="form-section" v-show="activeTab === 'plugins'">
          <h4>功能插件</h4>
          <p class="plugin-hint">开关立即生效,控制常用页小组件与侧边栏入口的显示。</p>
          <div class="plugin-list">
            <div v-for="p in PLUGINS" :key="p.id" class="plugin-row">
              <span class="plugin-icon"><component :is="p.icon" /></span>
              <div class="plugin-info">
                <span class="plugin-name">{{ p.name }}</span>
                <span class="plugin-desc">{{ p.desc }}</span>
              </div>
              <button
                type="button"
                class="switch"
                :class="{ on: isPluginOn(form as AppConfig, p.id) }"
                :title="isPluginOn(form as AppConfig, p.id) ? '点击关闭' : '点击开启'"
                @click="togglePlugin(p.id)"
              >
                <span class="switch-knob"></span>
              </button>
            </div>
          </div>
        </section>
      </div>
      </div>

      <footer class="modal-footer sp-footer">
        <span class="sp-hint">{{ autoSaveHint }}</span>
        <button class="btn-primary" @click="$emit('close')">完成</button>
      </footer>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { api, type AppConfig, type WallpaperItem } from '@/api'
import { useAppStore } from '@/stores/app'
import { useConfig } from '@/composables/useConfig'
import {
  CloseIcon,
  TrashIcon,
  DownloadIcon,
  UploadIcon,
  GearIcon,
  SearchIcon,
  ImageIcon,
  DatabaseIcon,
  LogoutIcon,
  BlocksIcon
} from './icons'
import { useAuth } from '@/composables/useAuth'
import { PLUGINS, isPluginOn } from '@/plugins'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { dialog, confirm: dialogConfirm } = useDialog()

const { state } = useAppStore()
const { saveConfig, loadConfig } = useConfig()
const { logout } = useAuth()

async function onLogout() {
  const ok = await dialogConfirm({
    title: '退出登录',
    message: '确定退出登录?本地数据不受影响。',
    confirmText: '退出'
  })
  if (!ok) return
  await logout()
}

// ESC 关闭设置抽屉
function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // 应用内对话框打开时,ESC 只作用于对话框
  if (dialog.open) return
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onEscKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onEscKey)
  // 关闭抽屉前把 600ms 防抖中未落盘的改动立即保存,防止丢配置
  if (saveDirty) {
    saveDirty = false
    if (saveTimer) clearTimeout(saveTimer)
    saveConfig(form as any).catch(() => {})
  }
})

// === 左右 TAB 布局 ===
const tabs = [
  { id: 'general', label: '常规', icon: GearIcon },
  { id: 'plugins', label: '插件', icon: BlocksIcon },
  { id: 'wallpaper', label: '壁纸', icon: ImageIcon },
  { id: 'search', label: '搜索', icon: SearchIcon },
  { id: 'backup', label: '备份', icon: DatabaseIcon }
]
const activeTab = ref('general')

// === 插件开关 ===
function togglePlugin(id: string) {
  const next = { ...(form.plugins || {}) }
  next[id] = !isPluginOn(form as AppConfig, id)
  form.plugins = next
}

const form = reactive<AppConfig>(JSON.parse(JSON.stringify(state.config || {
  title: '我的导航',
  background: { type: 'color', value: '#1f2937' },
  backgroundBlur: 0,
  backgroundMask: 0.35,
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

const bgTypes = [
  { value: 'color' as const, label: '纯色' },
  { value: 'gradient' as const, label: '渐变' },
  { value: 'bing' as const, label: '每日一图' },
  { value: 'image' as const, label: '图片' },
  { value: 'video' as const, label: '视频' }
]

// === 壁纸图库(多源) ===
const WP_SOURCES = [
  { id: 'bing', label: '必应精选' },
  { id: 'picsum', label: 'Picsum' },
  { id: 'wallhaven', label: 'Wallhaven' }
]
const wpSource = ref('bing')
const wpQ = ref('')
const wpPage = ref(1)
const wpItems = ref<WallpaperItem[]>([])
const wpLoading = ref(false)
const wpError = ref(false)

async function loadGallery() {
  wpLoading.value = true
  wpError.value = false
  try {
    const res = await api.getWallpapers(wpSource.value, wpQ.value.trim(), wpPage.value)
    wpItems.value = res.gallery || []
    wpError.value = wpItems.value.length === 0
  } catch {
    wpItems.value = []
    wpError.value = true
  } finally {
    wpLoading.value = false
  }
}

function reloadGallery() {
  wpPage.value = 1
  loadGallery()
}

function nextPage() {
  wpPage.value += 1
  loadGallery()
}

watch(wpSource, reloadGallery)
// 打开设置或切到壁纸 tab 时懒加载
watch(activeTab, (t) => {
  if (t === 'wallpaper' && !wpItems.value.length && !wpLoading.value) loadGallery()
})
watch(
  () => state.settingsOpen,
  (open) => {
    if (open && !wpItems.value.length && !wpLoading.value) loadGallery()
  }
)

// 应用壁纸:统一走 image 类型 + 直连 URL(自动从"每日一图"切到"图片")
function onPickWallpaper(w: WallpaperItem) {
  if (form.background.type !== 'image') {
    form.background.type = 'image'
    nextTick(() => {
      form.background.value = w.url
    })
  } else {
    form.background.value = w.url
  }
  ;(window as any).$toast?.('壁纸已应用,自动保存中', 'success')
}

// === 实时生效:表单变化后自动保存(debounce 600ms),无需点击保存按钮 ===
const autoSaveHint = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveDirty = false

watch(
  form,
  () => {
    saveDirty = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await saveConfig(form as any)
        saveDirty = false
        autoSaveHint.value = '✓ 已自动保存'
        setTimeout(() => (autoSaveHint.value = ''), 2000)
      } catch (e) {
        ;(window as any).$toast?.((e as Error).message, 'error')
      }
    }, 600)
  },
  { deep: true }
)

function addEngine() {
  form.engines.push({ id: 'engine_' + Date.now(), name: '', url: '' })
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
  const ok = await dialogConfirm({
    title: '导入备份',
    message: '导入将覆盖当前所有数据(分组、书签、配置),确定继续?',
    confirmText: '导入',
    danger: true
  })
  if (!ok) return
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
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
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
  backdrop-filter: blur(36px) saturate(1.7);
  -webkit-backdrop-filter: blur(36px) saturate(1.7);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* === 抽屉式设置面板(右侧滑入,对标 iTab/WeTab) === */
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  z-index: 1000;
  justify-content: flex-end;
  align-items: stretch;
  padding: 0;
  animation: drawerFade 0.25s var(--ease);
}

.drawer {
  width: 780px;
  max-width: 94vw;
  height: 100%;
  max-height: none;
  background: var(--bg-modal);
  backdrop-filter: blur(36px) saturate(1.7);
  -webkit-backdrop-filter: blur(36px) saturate(1.7);
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: drawerSlide 0.28s var(--ease);
}

@keyframes drawerFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes drawerSlide {
  from {
    transform: translateX(48px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
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

/* === 插件开关 === */
.plugin-hint {
  font-size: 12.5px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  transition: var(--transition);
}

.plugin-row:hover {
  border-color: var(--border-strong);
}

.plugin-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 62%, #7c5cff));
  flex-shrink: 0;
}

.plugin-icon svg {
  width: 17px;
  height: 17px;
}

.plugin-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
}

.plugin-desc {
  font-size: 12px;
  color: var(--text-muted);
}

/* iOS 风格开关 */
.switch {
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 30%, transparent);
  position: relative;
  cursor: pointer;
  transition: background 0.25s var(--ease);
  flex-shrink: 0;
}

.switch .switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  transition: transform 0.25s var(--ease);
}

.switch.on {
  background: var(--accent);
}

.switch.on .switch-knob {
  transform: translateX(18px);
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
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

/* === 左右 TAB 布局(对标 iTab 设置中心) === */
.sp-layout {
  flex: 1;
  min-height: 0;
  display: flex;
}

.sp-menu {
  width: 172px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.sp-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: 0.15s var(--ease);
  text-align: left;
}

.sp-menu-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.sp-menu-item.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-weight: 500;
}

.sp-menu-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.sp-body {
  flex: 1;
  min-width: 0;
}

.sp-footer {
  justify-content: space-between;
}

.sp-hint {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.85;
}

@media (max-width: 640px) {
  .sp-layout {
    flex-direction: column;
  }
  .sp-menu {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    padding: 8px 10px;
  }
  .sp-menu-item {
    flex-shrink: 0;
    padding: 7px 10px;
  }
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

/* 退出登录按钮 */
.btn-logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  transition: var(--transition);
}

.btn-logout:hover {
  background: color-mix(in srgb, var(--danger) 18%, transparent);
}

.btn-logout svg {
  width: 15px;
  height: 15px;
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

/* 壁纸图库(多源) */
.wp-gallery-wrap {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.wp-tabs {
  display: flex;
  gap: 6px;
}

.wp-tab {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  transition: 0.15s;
}

.wp-tab:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.wp-tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 500;
}

.wp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wp-search {
  display: flex;
  gap: 6px;
}

.wp-search input {
  width: 180px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.wp-search input:focus {
  border-color: var(--accent);
}

.wp-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  transition: 0.15s;
}

.wp-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}

.wp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wallpaper-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
  padding: 2px;
}

.wallpaper-thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid transparent;
  padding: 0;
  transition: 0.2s var(--ease);
  background: var(--bg-card);
}

.wallpaper-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wallpaper-thumb:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
}

.wallpaper-thumb:hover img {
  transform: scale(1.04);
}

.wallpaper-thumb img {
  transition: transform 0.25s var(--ease);
}

.wallpaper-thumb.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.wp-thumb-title {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 8px 5px;
  font-size: 10.5px;
  color: #fff;
  text-align: left;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: 0.2s var(--ease);
  pointer-events: none;
}

.wallpaper-thumb:hover .wp-thumb-title {
  opacity: 1;
}

.gallery-hint {
  grid-column: 1 / -1;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 12px 0;
}
</style>
