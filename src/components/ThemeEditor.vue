<template>
  <div class="theme-editor">
    <!-- 主题列表 -->
    <div class="te-list">
      <h4>配色主题</h4>
      <div
        v-for="t in allThemes"
        :key="t.id"
        class="te-item"
        :class="{ active: t.id === activeId }"
        @click="onSelect(t)"
      >
        <span class="te-swatch" :style="{ background: t.accent }"></span>
        <span class="te-name">{{ t.name }}</span>
        <span v-if="isBuiltin(t.id)" class="te-badge">内置</span>
        <div class="te-actions" @click.stop>
          <button class="te-btn" title="编辑" @click="startEdit(t)">
            <EditIcon />
          </button>
          <button
            v-if="!isBuiltin(t.id)"
            class="te-btn danger"
            title="删除"
            @click="onDelete(t)"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      <button class="te-add" @click="onAdd">+ 新建主题</button>
    </div>

    <!-- 编辑区 -->
    <div v-if="editing" class="te-edit">
      <div class="te-edit-header">
        <input v-model="editing.name" class="te-name-input" />
        <span class="te-hint">编辑实时预览</span>
        <button class="te-save" @click="onSave">保存</button>
        <button class="te-btn" title="关闭编辑" @click="editing = null">
          <CloseIcon />
        </button>
      </div>

      <div class="te-sections">
        <div v-for="sec in sections" :key="sec.title" class="te-section">
          <h5>{{ sec.title }}</h5>
          <div v-for="f in sec.fields" :key="f.key" class="te-field">
            <span class="te-field-label">{{ f.label }}</span>
            <template v-if="f.type === 'color'">
              <ThemeColorInput
                :model-value="(editing as any)[f.key]"
                @update:model-value="onColor(f.key, $event)"
              />
            </template>
            <template v-else-if="f.type === 'number'">
              <input
                class="te-num"
                type="number"
                :min="f.min ?? 0"
                :max="f.max ?? 100"
                :step="f.step ?? 1"
                :value="(editing as any)[f.key]"
                @input="onNumber(f.key, ($event.target as HTMLInputElement).value)"
              />
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useConfig } from '@/composables/useConfig'
import { BUILTIN_THEMES, applyThemeConfig } from '@/theme/presets'
import type { ThemeConfig } from '@/api'
import ThemeColorInput from './ThemeColorInput.vue'
import { EditIcon, TrashIcon, CloseIcon } from './icons'

const { allThemes, currentTheme, selectTheme, addTheme, updateTheme, deleteTheme } = useConfig()

const activeId = ref(currentTheme.value.id)
const editing = ref<ThemeConfig | null>(null)

function isBuiltin(id: string) {
  return BUILTIN_THEMES.some((t) => t.id === id)
}

async function onSelect(t: ThemeConfig) {
  activeId.value = t.id
  editing.value = null
  await selectTheme(t.id)
  ;(window as any).$toast?.(`已切换主题「${t.name}」`, 'success')
}

async function onAdd() {
  const t = await addTheme()
  editing.value = t
  activeId.value = t.id
  applyThemeConfig(t)
}

function startEdit(t: ThemeConfig) {
  // 编辑内置主题时先复制为自定义主题
  if (isBuiltin(t.id)) {
    addTheme(t).then((nt) => {
      editing.value = nt
      activeId.value = nt.id
      applyThemeConfig(nt)
    })
    return
  }
  editing.value = JSON.parse(JSON.stringify(t)) as ThemeConfig
  applyThemeConfig(editing.value)
}

async function onDelete(t: ThemeConfig) {
  if (!confirm(`删除主题「${t.name}」?`)) return
  await deleteTheme(t.id)
  if (activeId.value === t.id) activeId.value = currentTheme.value.id
  if (editing.value?.id === t.id) editing.value = null
  ;(window as any).$toast?.('已删除', 'success')
}

async function onSave() {
  if (!editing.value) return
  await updateTheme(editing.value)
  ;(window as any).$toast?.('主题已保存', 'success')
}

// 编辑时实时预览(直接把草稿注入 CSS 变量)
watchEffect(() => {
  if (editing.value) applyThemeConfig(editing.value)
})

function onColor(key: string, v: string) {
  if (!editing.value) return
  ;(editing.value as any)[key] = v
}

function onNumber(key: string, raw: string) {
  if (!editing.value) return
  const n = Number(raw)
  if (Number.isNaN(n)) return
  ;(editing.value as any)[key] = n
}

// 字段分区定义
interface FieldDef {
  key: keyof ThemeConfig
  label: string
  type: 'color' | 'number'
  min?: number
  max?: number
  step?: number
}
interface SectionDef {
  title: string
  fields: FieldDef[]
}

const sections: SectionDef[] = [
  {
    title: '基础',
    fields: [
      { key: 'bgPage', label: '页面背景', type: 'color' },
      { key: 'bgCard', label: '卡片背景', type: 'color' },
      { key: 'bgCardHover', label: '卡片悬浮', type: 'color' },
      { key: 'bgGlass', label: '玻璃背景', type: 'color' },
      { key: 'bgGlassStrong', label: '强玻璃背景', type: 'color' },
      { key: 'bgModal', label: '弹窗背景', type: 'color' },
      { key: 'bgInput', label: '输入框背景', type: 'color' },
      { key: 'textPrimary', label: '主文字', type: 'color' },
      { key: 'textSecondary', label: '次要文字', type: 'color' },
      { key: 'textMuted', label: '弱化文字', type: 'color' },
      { key: 'borderColor', label: '边框', type: 'color' },
      { key: 'borderStrong', label: '强边框', type: 'color' },
      { key: 'accent', label: '主色调', type: 'color' },
      { key: 'accentHover', label: '主色调悬浮', type: 'color' },
      { key: 'danger', label: '危险色', type: 'color' },
      { key: 'success', label: '成功色', type: 'color' },
      { key: 'warning', label: '警示色', type: 'color' }
    ]
  },
  {
    title: '搜索框',
    fields: [
      { key: 'searchBg', label: '搜索框背景', type: 'color' },
      { key: 'searchText', label: '搜索文字', type: 'color' },
      { key: 'searchPlaceholder', label: '占位文字', type: 'color' },
      { key: 'searchBtnBg', label: '搜索按钮', type: 'color' },
      { key: 'searchBtnIcon', label: '按钮图标', type: 'color' }
    ]
  },
  {
    title: '搜索 tab',
    fields: [
      { key: 'searchTabDefaultBg', label: '默认背景', type: 'color' },
      { key: 'searchTabActiveBg', label: '选中背景', type: 'color' },
      { key: 'searchTabText', label: '默认文字', type: 'color' },
      { key: 'searchTabActiveText', label: '选中文字', type: 'color' }
    ]
  },
  {
    title: '书签分组标签',
    fields: [
      { key: 'groupTabDefaultBg', label: '默认背景', type: 'color' },
      { key: 'groupTabActiveBg', label: '选中背景', type: 'color' },
      { key: 'groupTabText', label: '默认文字', type: 'color' },
      { key: 'groupTabActiveText', label: '选中文字', type: 'color' }
    ]
  },
  {
    title: '书签文字',
    fields: [
      { key: 'bookmarkText', label: '文字颜色', type: 'color' },
      { key: 'bookmarkFontSize', label: '文字大小', type: 'number', min: 10, max: 24, step: 1 }
    ]
  },
  {
    title: '顶部导航',
    fields: [
      { key: 'topbarBg', label: '导航背景', type: 'color' },
      { key: 'topbarOpacity', label: '背景透明度', type: 'number', min: 0, max: 1, step: 0.05 }
    ]
  },
  {
    title: '图标',
    fields: [
      { key: 'iconColor', label: '图标颜色', type: 'color' },
      { key: 'iconSize', label: '图标大小', type: 'number', min: 12, max: 32, step: 1 }
    ]
  },
  {
    title: '右侧分组切换',
    fields: [
      { key: 'sidebarBg', label: '面板背景', type: 'color' },
      { key: 'sidebarDot', label: '圆点颜色', type: 'color' },
      { key: 'sidebarDotActive', label: '圆点选中', type: 'color' },
      { key: 'sidebarArrow', label: '箭头颜色', type: 'color' },
      { key: 'sidebarText', label: '文字颜色', type: 'color' }
    ]
  }
]
</script>

<style scoped>
.theme-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.te-list h4 {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.te-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  cursor: pointer;
  margin-bottom: 6px;
  transition: var(--transition);
}

.te-item:hover {
  background: var(--bg-card-hover);
}

.te-item.active {
  border-color: var(--accent);
  background: var(--bg-card);
}

.te-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  flex-shrink: 0;
}

.te-name {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.te-badge {
  font-size: 11px;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.te-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.te-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--text-secondary);
}

.te-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.te-btn.danger:hover {
  color: var(--danger);
}

.te-btn svg {
  width: 14px;
  height: 14px;
}

.te-add {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition);
}

.te-add:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

/* 编辑区 */
.te-edit {
  border-top: 1px solid var(--border-color);
  padding-top: 14px;
}

.te-edit-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.te-name-input {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
}

.te-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.te-save {
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.te-save:hover {
  background: var(--accent-hover);
}

.te-sections {
  max-height: 55vh;
  overflow-y: auto;
  padding-right: 4px;
}

.te-section {
  margin-bottom: 16px;
}

.te-section h5 {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.te-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
}

.te-field-label {
  width: 96px;
  flex-shrink: 0;
  text-align: right;
  color: var(--text-secondary);
}

.te-num {
  width: 80px;
  padding: 4px 8px;
  font-size: 13px;
}

@media (max-width: 640px) {
  .te-field {
    flex-direction: column;
    align-items: stretch;
  }
  .te-field-label {
    width: auto;
    text-align: left;
  }
}
</style>
