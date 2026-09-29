<template>
  <div class="nav-page">
    <!-- 左侧分组侧边栏 -->
    <GroupSidebar
      :index="currentIndex"
      :settings-active="state.settingsOpen"
      @change="switchTo"
      @open-settings="state.settingsOpen = true"
    />

    <!-- 右侧主区 -->
    <div class="main-col">
      <!-- 主体: 时钟 + 搜索框 + 当前分组书签 -->
      <main class="content" @wheel="onWheel">
        <DateTime />
        <div class="search-area">
          <SearchBar />
        </div>

        <!-- 当前分组书签(切换分组时淡入上滑过渡) -->
        <Transition name="view" mode="out-in">
          <div class="group-content" v-if="currentGroup" :key="currentGroup.id">
          <!-- 常用分组:二维自由布局画布(磁贴 + 书签按网格坐标摆放,拖到哪就是哪,允许空洞) -->
          <template v-if="currentGroup.id === FAV_GROUP_ID">
            <div
              ref="gridRef"
              class="fav-grid"
              @dragstart.prevent
              @contextmenu.prevent="onFavContextMenu"
            >
              <!-- 拖拽时的落点预览(虚线框,只做提示不挤动其他卡片) -->
              <div v-if="preview" class="fav-preview" :style="previewStyle"></div>
              <div
                v-for="it in favItems"
                :key="it.key"
                class="fav-cell"
                :class="{ dragging: dragKey === it.key }"
                :style="dragKey === it.key ? dragStyle : cellStyle(it)"
                @pointerdown="onCellPointerDown($event, it)"
              >
                <component
                  v-if="it.type === 'widget'"
                  :is="it.component"
                  :sources="it.id === 'hot' ? HOT_SOURCES : undefined"
                  @open="onWidgetOpen(it.id || '')"
                />
                <BookmarkCard
                  v-else
                  :bookmark="it.bookmark!"
                  :group-id="it.groupId!"
                  :native-drag="false"
                />
              </div>
            </div>
            <div v-if="favItems.length === 0" class="empty-group">
              <p>还没有常用书签,把书签拖到侧边栏「常用」,或在书签编辑中勾选</p>
            </div>
          </template>

          <!-- 普通分组:可拖拽排序 -->
          <template v-else>
            <Draggable
              v-model="currentGroup.bookmarks"
              :group="{ name: 'bookmarks', pull: false, put: false }"
              item-key="id"
              :animation="150"
              ghost-class="drag-ghost"
              chosen-class="drag-chosen"
              drag-class="drag-dragging"
              class="bookmark-grid"
              @change="onBookmarkSort"
            >
              <template #item="{ element }">
                <BookmarkCard
                  :bookmark="element"
                  :group-id="currentGroup.id"
                />
              </template>
            </Draggable>

            <div v-if="currentGroup.bookmarks.length === 0" class="empty-group">
              <p>该分组还没有书签</p>
              <button class="btn-add" @click="onAddBookmark">
                <PlusIcon /> 添加书签
              </button>
            </div>
          </template>
          </div>
          <div v-else key="__empty__" class="empty">
            <p>还没有分组,点击左侧「添加分组」创建你的第一个分组</p>
          </div>
        </Transition>

        <!-- 添加书签按钮(常驻在 Transition 外,切换分组不卸载不闪烁) -->
        <button
          v-if="currentGroup && currentGroup.id !== FAV_GROUP_ID && currentGroup.bookmarks.length > 0"
          class="btn-add-floating"
          @click="onAddBookmark"
          title="添加书签"
        >
          <PlusIcon />
        </button>
      </main>
    </div>

    <SettingsPanel v-if="state.settingsOpen" @close="state.settingsOpen = false" />
    <BookmarkEditor
      v-if="editor.open"
      :group-id="editor.groupId"
      :bookmark="editor.bookmark"
      @close="editor.open = false"
    />

    <!-- 记事本管理弹窗(常用页小组件 / 侧边栏入口打开) -->
    <NotesModal v-if="notesOpen" @close="notesOpen = false" />

    <!-- 待办管理弹窗(常用页小组件点击打开) -->
    <TodoModal v-if="todoOpen" @close="todoOpen = false" />

    <!-- 热榜聚合弹窗 -->
    <HotModal v-if="hotOpen" @close="hotOpen = false" />

    <!-- 汇率换算弹窗 -->
    <RateModal v-if="rateOpen" @close="rateOpen = false" />

    <!-- 日历·农历弹窗 -->
    <CalendarModal v-if="calOpen" @close="calOpen = false" />

    <!-- 天气弹窗 -->
    <WeatherModal v-if="weatherOpen" @close="weatherOpen = false" />

    <!-- 底部每日一言(点击换一句) -->
    <QuoteBar />

    <!-- 常用页空白处右键菜单:重置布局 -->
    <Teleport to="body">
      <div v-if="favMenu" class="fav-ctx-mask" @click="favMenu = null" @contextmenu.prevent="favMenu = null">
        <div class="fav-ctx-menu" :style="{ left: favMenu.x + 'px', top: favMenu.y + 'px' }">
          <button class="fav-ctx-item" @click="onResetFavLayout">
            <LayoutIcon /> 重置常用页布局
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import Draggable from 'vuedraggable'
import type { Component, CSSProperties } from 'vue'
import DateTime from './DateTime.vue'
import SearchBar from './SearchBar.vue'
import BookmarkCard from './BookmarkCard.vue'
import GroupSidebar from './GroupSidebar.vue'
import SettingsPanel from './SettingsPanel.vue'
import BookmarkEditor from './BookmarkEditor.vue'
import TodoWidget from './TodoWidget.vue'
import NotesWidget from './NotesWidget.vue'
import HotWidget from './HotWidget.vue'
import RateWidget from './RateWidget.vue'
import CalendarWidget from './CalendarWidget.vue'
import WeatherWidget from './WeatherWidget.vue'
import QuoteBar from './QuoteBar.vue'
import NotesModal from './NotesModal.vue'
import TodoModal from './TodoModal.vue'
import HotModal from './HotModal.vue'
import RateModal from './RateModal.vue'
import CalendarModal from './CalendarModal.vue'
import WeatherModal from './WeatherModal.vue'
import { PlusIcon, LayoutIcon } from './icons'
import { useAppStore } from '@/stores/app'
import { useGroups } from '@/composables/useGroups'
import { useNotes } from '@/composables/useNotes'
import { useTodos } from '@/composables/useTodos'
import { useUI } from '@/composables/useUI'
import { PLUGINS, isPluginOn } from '@/plugins'
import { api, HOT_SOURCES } from '@/api'
import type { Bookmark, Group } from '@/api'

// 虚拟分组ID:代表"常用"
const FAV_GROUP_ID = '__favorites__'
const FAV_GROUP_NAME = '常用'

const { state } = useAppStore()
const { saveBookmarks } = useGroups()
const { loadNotes } = useNotes()
const { loadTodos } = useTodos()
const { loadUI, setFavLayout, ui } = useUI()

// 弹窗开关
const todoOpen = ref(false)
const notesOpen = ref(false)
const hotOpen = ref(false)
const rateOpen = ref(false)
const calOpen = ref(false)
const weatherOpen = ref(false)

// 小组件点击打开对应管理弹窗
function onWidgetOpen(id: string) {
  if (id === 'todo') todoOpen.value = true
  else if (id === 'hot') hotOpen.value = true
  else if (id === 'rate') rateOpen.value = true
  else if (id === 'calendar') calOpen.value = true
  else if (id === 'weather') weatherOpen.value = true
  else notesOpen.value = true
}

const editor = reactive<{ open: boolean; groupId: string; bookmark: Bookmark | null }>({
  open: false,
  groupId: '',
  bookmark: null
})

;(window as any).$openBookmarkEditor = (groupId: string, bookmark: Bookmark | null = null) => {
  editor.groupId = groupId
  editor.bookmark = bookmark
  editor.open = true
}

const currentIndex = ref(0)

// 合成分组列表:常用(虚拟) + 真实分组(侧边栏索引与之一致)
const allGroups = computed<Group[]>(() => {
  const favGroup: Group = {
    id: FAV_GROUP_ID,
    name: FAV_GROUP_NAME,
    sort: -1,
    bookmarks: []
  }
  return [favGroup, ...state.groups]
})

// 当前选中的分组(含虚拟常用组)
const currentGroup = computed<Group | null>(() => {
  if (allGroups.value.length === 0) return null
  if (currentIndex.value >= allGroups.value.length) {
    currentIndex.value = allGroups.value.length - 1
  }
  return allGroups.value[currentIndex.value] || null
})

// 所有分组中标记为常用的书签(带 _groupId 来源标记)
const allFavorites = computed(() => {
  const result: (Bookmark & { _groupId: string })[] = []
  for (const g of state.groups) {
    for (const b of g.bookmarks) {
      if (b.favorite) {
        result.push({ ...b, _groupId: g.id })
      }
    }
  }
  return result
})

// === 常用页二维自由布局(对标 mTab:约定规格 + 网格坐标,拖到哪就是哪) ===
interface FavItem {
  key: string
  type: 'widget' | 'bookmark'
  // widget 专用
  id?: string
  component?: Component
  // bookmark 专用
  bookmark?: Bookmark & { _groupId?: string }
  groupId?: string
  // 布局(网格坐标与跨格数)
  w: number
  h: number
  x: number
  y: number
}

// 插件 id -> 组件映射(新增插件时在这里注册组件)
const WIDGET_COMPONENTS: Record<string, Component> = {
  todo: TodoWidget,
  notepad: NotesWidget,
  hot: HotWidget,
  rate: RateWidget,
  calendar: CalendarWidget,
  weather: WeatherWidget
}

// 尺寸规格注册表(单位 = 网格单元,书签固定 1x1)
// 以后给插件加"多规格"(宽版/小方格)只改这里,例如 xx: { w: 4, h: 2 }
const WIDGET_SPECS: Record<string, { w: number; h: number }> = {
  todo: { w: 3, h: 2 },
  notepad: { w: 3, h: 2 },
  hot: { w: 4, h: 2 },
  rate: { w: 3, h: 2 },
  calendar: { w: 1, h: 1 },
  weather: { w: 1, h: 1 }
}

// 网格几何(需与 CSS 保持一致)
const CELL_MIN_W = 108
const COL_GAP = 10
const ROW_H = 102
const ROW_GAP = 18

const gridRef = ref<HTMLElement | null>(null)
const cols = ref(10)
let gridRO: ResizeObserver | null = null

function measureCols() {
  const el = gridRef.value
  if (!el) return
  cols.value = Math.max(1, Math.floor((el.clientWidth + COL_GAP) / (CELL_MIN_W + COL_GAP)))
}

watch(gridRef, (el, old) => {
  if (old && gridRO) gridRO.unobserve(old)
  if (el) {
    measureCols()
    if (!gridRO) gridRO = new ResizeObserver(measureCols)
    gridRO.observe(el)
  }
})
onUnmounted(() => gridRO?.disconnect())

function specOf(it: { type: string; id?: string }) {
  return it.type === 'widget' ? WIDGET_SPECS[it.id || ''] || { w: 3, h: 2 } : { w: 1, h: 1 }
}

interface Box {
  key: string
  x: number
  y: number
  w: number
  h: number
}

function overlaps(x: number, y: number, w: number, h: number, b: Box) {
  return x < b.x + b.w && b.x < x + w && y < b.y + b.h && b.y < y + h
}

function overlapsAny(x: number, y: number, w: number, h: number, boxes: Box[]) {
  return boxes.some((b) => overlaps(x, y, w, h, b))
}

// 从 (0,0) 行优先找第一个可容纳位置(用于无坐标的新项)
function firstFree(w: number, h: number, boxes: Box[]): { x: number; y: number } {
  for (let y = 0; y < 500; y++) {
    for (let x = 0; x + w <= cols.value; x++) {
      if (!overlapsAny(x, y, w, h, boxes)) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

// 从目标格螺旋扩散找最近空位(拖拽冲突时)
function nearestFree(cx: number, cy: number, w: number, h: number, boxes: Box[]): { x: number; y: number } | null {
  for (let r = 0; r < 80; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (const dx of r === 0 ? [0] : [-r, r]) {
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x + w <= cols.value && y >= 0 && !overlapsAny(x, y, w, h, boxes)) return { x, y }
      }
    }
    // 当前行内左右扫(同 r 的中间部分)
    if (r > 0) {
      for (let dx = -r + 1; dx <= r - 1; dx++) {
        for (const dy of [-r, r]) {
          const x = cx + dx
          const y = cy + dy
          if (x >= 0 && x + w <= cols.value && y >= 0 && !overlapsAny(x, y, w, h, boxes)) return { x, y }
        }
      }
    }
  }
  return null
}

// 拖拽中的坐标覆盖(键 -> 新坐标),落盘后清空
const layoutOverrides = ref<Record<string, { x: number; y: number }>>({})
const dragKey = ref<string | null>(null)

const favItems = computed<FavItem[]>(() => {
  const widgets = PLUGINS.filter(
    (p) => isPluginOn(state.config, p.id) && WIDGET_COMPONENTS[p.id]
  ).map((p) => ({
    key: `widget:${p.id}`,
    type: 'widget' as const,
    id: p.id,
    component: WIDGET_COMPONENTS[p.id],
    ...WIDGET_SPECS[p.id] || { w: 3, h: 2 }
  }))
  const bookmarks = allFavorites.value.map((b) => ({
    key: `bm:${b._groupId}:${b.id}`,
    type: 'bookmark' as const,
    bookmark: b,
    groupId: b._groupId || '',
    w: 1,
    h: 1
  }))

  const all = [...widgets, ...bookmarks]
  // 已保存坐标(兼容旧版字符串数组:直接忽略走自动排布)
  const saved = new Map<string, { x: number; y: number }>()
  for (const e of (ui.favLayout || []) as Array<unknown>) {
    if (e && typeof e === 'object' && typeof (e as any).key === 'string' && Number.isFinite((e as any).x) && Number.isFinite((e as any).y)) {
      saved.set((e as any).key, { x: (e as any).x, y: (e as any).y })
    }
  }

  const boxes: Box[] = []
  const result: FavItem[] = []
  for (const it of all) {
    let candidate: { x: number; y: number } | null =
      layoutOverrides.value[it.key] || saved.get(it.key) || null
    // 列数变化防溢出
    if (candidate && (candidate.x < 0 || candidate.y < 0 || candidate.x + it.w > cols.value)) {
      candidate = {
        x: Math.max(0, Math.min(candidate.x, cols.value - it.w)),
        y: Math.max(0, candidate.y)
      }
    }
    // 与其他项重叠(数据异常)则重新排布
    if (candidate && overlapsAny(candidate.x, candidate.y, it.w, it.h, boxes)) {
      candidate = null
    }
    const pos = candidate ?? firstFree(it.w, it.h, boxes)
    boxes.push({ key: it.key, x: pos.x, y: pos.y, w: it.w, h: it.h })
    result.push({ ...it, x: pos.x, y: pos.y } as FavItem)
  }
  return result
})

function cellStyle(it: FavItem) {
  return {
    gridColumn: `${it.x + 1} / span ${it.w}`,
    gridRow: `${it.y + 1} / span ${it.h}`
  }
}

// === 指针拖拽(鼠标;触屏不拦截以保证页面可滚动) ===
// 体验:拖动时卡片 1:1 跟手(不再逐格跳动),网格上只显示虚线落点预览;松手才吸附进目标格
interface DragCtx {
  key: string
  w: number
  h: number
  origin: { x: number; y: number }
  px: number
  py: number
  moved: boolean
  rect: { left: number; top: number; width: number; height: number }
}
let dragCtx: DragCtx | null = null

// 跟手拖动的视觉状态(模板响应式)
const dragRect = ref({ left: 0, top: 0, width: 0, height: 0 })
const dragOffset = ref({ dx: 0, dy: 0 })
// 落点预览(网格坐标)
const preview = ref<{ x: number; y: number; w: number; h: number } | null>(null)

const dragStyle = computed<CSSProperties>(() => ({
  position: 'fixed',
  left: `${dragRect.value.left}px`,
  top: `${dragRect.value.top}px`,
  width: `${dragRect.value.width}px`,
  height: `${dragRect.value.height}px`,
  margin: '0',
  transform: `translate3d(${dragOffset.value.dx}px, ${dragOffset.value.dy}px, 0) scale(1.03)`,
  filter: 'drop-shadow(0 14px 28px rgba(0, 0, 0, 0.35))',
  zIndex: 30,
  cursor: 'grabbing',
  pointerEvents: 'none',
  transition: 'none'
}))

const previewStyle = computed(() =>
  preview.value
    ? {
        gridColumn: `${preview.value.x + 1} / span ${preview.value.w}`,
        gridRow: `${preview.value.y + 1} / span ${preview.value.h}`
      }
    : {}
)

function onCellPointerDown(e: PointerEvent, it: FavItem) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  dragCtx = {
    key: it.key,
    w: it.w,
    h: it.h,
    origin: { x: it.x, y: it.y },
    px: e.clientX,
    py: e.clientY,
    moved: false,
    rect: { left: r.left, top: r.top, width: r.width, height: r.height }
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragUp, { once: true })
}

function pointToCell(clientX: number, clientY: number, w: number, h: number) {
  const el = gridRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const cellW = (rect.width - (cols.value - 1) * COL_GAP) / cols.value
  const col = Math.round((clientX - rect.left) / (cellW + COL_GAP) - (w - 1) / 2)
  const row = Math.round((clientY - rect.top) / (ROW_H + ROW_GAP) - (h - 1) / 2)
  return {
    x: Math.max(0, Math.min(col, cols.value - w)),
    y: Math.max(0, row)
  }
}

// 结算拖放目标:空闲直接放;1x1 压到 1x1 书签上则交换;其余找最近空位
function placementFor(
  target: { x: number; y: number },
  ctx: { key: string; w: number; h: number; origin: { x: number; y: number } }
): Record<string, { x: number; y: number }> | null {
  const others: Box[] = favItems.value
    .filter((i) => i.key !== ctx.key)
    .map(({ key, x, y, w, h }) => ({ key, x, y, w, h }))

  if (!overlapsAny(target.x, target.y, ctx.w, ctx.h, others)) {
    return { [ctx.key]: target }
  }
  if (ctx.w === 1 && ctx.h === 1) {
    const hit = others.find(
      (i) => i.w === 1 && i.h === 1 && target.x >= i.x && target.x < i.x + i.w && target.y >= i.y && target.y < i.y + i.h
    )
    if (hit) {
      return { [ctx.key]: target, [hit.key]: ctx.origin }
    }
  }
  const free = nearestFree(target.x, target.y, ctx.w, ctx.h, others)
  return free ? { [ctx.key]: free } : null
}

function onDragMove(e: PointerEvent) {
  if (!dragCtx) return
  const dist = Math.hypot(e.clientX - dragCtx.px, e.clientY - dragCtx.py)
  if (!dragCtx.moved) {
    if (dist < 6) return
    dragCtx.moved = true
    dragKey.value = dragCtx.key
    dragRect.value = { ...dragCtx.rect }
  }
  // 卡片 1:1 跟手
  dragOffset.value = { dx: e.clientX - dragCtx.px, dy: e.clientY - dragCtx.py }
  // 落点预览(只算不摆,不影响其他卡片)
  const target = pointToCell(e.clientX, e.clientY, dragCtx.w, dragCtx.h)
  if (target && dragCtx) {
    const p = placementFor(target, dragCtx)
    const mine = p ? p[dragCtx.key] : null
    preview.value = mine ? { x: mine.x, y: mine.y, w: dragCtx.w, h: dragCtx.h } : null
  }
}

function onDragUp(e: PointerEvent) {
  window.removeEventListener('pointermove', onDragMove)
  const ctx = dragCtx
  dragCtx = null
  preview.value = null
  if (!ctx) return
  if (!ctx.moved) {
    dragKey.value = null
    return
  }
  // 拖动后的 click 误触发拦截
  const swallow = (ev: MouseEvent) => {
    ev.stopPropagation()
    ev.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, true), 300)
  // 松手才结算:把卡片放进目标格(交换/最近空位规则同前)
  const target = pointToCell(e.clientX, e.clientY, ctx.w, ctx.h)
  if (target) {
    const p = placementFor(target, ctx)
    if (p) layoutOverrides.value = p
  }
  // 持久化最终布局
  setFavLayout(favItems.value.map((i) => ({ key: i.key, x: i.x, y: i.y })))
  dragKey.value = null
  layoutOverrides.value = {}
}

function switchTo(i: number) {
  if (allGroups.value.length === 0) return
  let next = i
  if (next < 0) next = 0
  if (next > allGroups.value.length - 1) next = allGroups.value.length - 1
  if (next === currentIndex.value) return
  currentIndex.value = next
}

// 滚轮切换分组(累积 deltaY,达到阈值切换一个,支持持续滚动)
let wheelAccum = 0
const WHEEL_THRESHOLD = 80
function onWheel(e: WheelEvent) {
  // 任一弹窗/抽屉打开时不切换分组(Teleport 弹窗不在 .modal 选择器覆盖内,统一用状态守卫)
  if (state.settingsOpen || todoOpen.value || notesOpen.value || hotOpen.value || rateOpen.value || calOpen.value || weatherOpen.value || editor.open) return
  const target = e.target as HTMLElement
  if (
    target?.closest?.('.card-actions') ||
    target?.closest?.('.modal') ||
    target?.closest?.('.group-sidebar') ||
    target?.closest?.('.bookmark-grid') ||
    target?.closest?.('.fav-grid') ||
    target?.closest?.('.search-box') ||
    target?.closest?.('.drawer')
  ) {
    return
  }
  wheelAccum += e.deltaY
  if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
    if (wheelAccum > 0) {
      switchTo(currentIndex.value + 1)
    } else {
      switchTo(currentIndex.value - 1)
    }
    wheelAccum = 0
  }
  // 停止滚动一小段时间后重置
  clearTimeout((onWheel as any)._timer)
  ;(onWheel as any)._timer = setTimeout(() => { wheelAccum = 0 }, 200)
}

// 键盘左右切换(任一弹窗/抽屉打开时不响应,避免误切背景分组)
function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (state.settingsOpen || todoOpen.value || notesOpen.value || hotOpen.value || rateOpen.value || calOpen.value || weatherOpen.value || editor.open) return
  if (e.key === 'ArrowLeft') switchTo(currentIndex.value - 1)
  else if (e.key === 'ArrowRight') switchTo(currentIndex.value + 1)
}

// 书签排序变更
async function onBookmarkSort() {
  const g = currentGroup.value
  if (!g || g.id === FAV_GROUP_ID) return
  try {
    await saveBookmarks(g.id, g.bookmarks)
  } catch (e) {
    ;(window as any).$toast?.((e as Error).message, 'error')
  }
}

function onAddBookmark() {
  const g = currentGroup.value
  if (!g || g.id === FAV_GROUP_ID) {
    ;(window as any).$toast?.('请先选择一个真实分组', 'error')
    return
  }
  ;(window as any).$openBookmarkEditor?.(g.id, null)
}

// === 常用页右键菜单:重置布局 ===
const favMenu = ref<{ x: number; y: number } | null>(null)

function onFavContextMenu(e: MouseEvent) {
  // 书签卡片有自己的右键菜单,不拦截;磁贴和空白处弹出重置布局菜单
  if ((e.target as HTMLElement)?.closest?.('.fav-cell .bookmark-card')) return
  favMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - 190 - 8),
    y: Math.min(e.clientY, window.innerHeight - 50 - 8)
  }
}

async function onResetFavLayout() {
  favMenu.value = null
  setFavLayout([])
  ;(window as any).$toast?.('常用页布局已重置', 'success')
}

onMounted(async () => {
  loadNotes().catch(() => {})
  loadTodos().catch(() => {})
  loadUI().catch(() => {})
  autoCloudBackup().catch(() => {})
  window.addEventListener('keydown', onKeydown)
  // 加载完成后自动聚焦搜索框
  nextTick(() => {
    const input = document.querySelector('.search-box input') as HTMLInputElement
    if (input) input.focus()
  })
})

// 每日自动云备份:开启且距上次备份超过 24h 时静默执行,失败不打扰用户
async function autoCloudBackup() {
  try {
    const cfg = await api.getCloudConfig()
    if (!cfg.auto || !cfg.bucket || !cfg.ak) return
    if (cfg.lastBackupAt && Date.now() - cfg.lastBackupAt < 24 * 3600 * 1000) return
    await api.cloudAction('run')
  } catch {
    /* 静默失败 */
  }
}
</script>

<style scoped>
.nav-page {
  height: 100vh;
  display: flex;
  overflow: hidden;
}

/* 右侧主区 */
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 主体内容 */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 64px 24px 24px;
  overflow-y: auto;
  overflow-x: hidden;
}

.search-area {
  width: 100%;
  max-width: 720px;
  display: flex;
  justify-content: center;
  /* 与下方内容拉开距离 */
  margin-bottom: 20px;
}

/* 分组内容区 */
.group-content {
  width: 100%;
  max-width: 1600px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  padding-bottom: 20px;
}

.bookmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 18px 10px;
  width: 100%;
}

/* 常用页二维自由布局画布(磁贴 + 书签按网格坐标摆放,对标 mTab) */
.fav-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  /* 行高 = 书签卡高度,磁贴跨 2 行自动拼高 */
  grid-auto-rows: 102px;
  gap: 18px 10px;
  user-select: none;
}

.fav-cell {
  min-width: 0;
  min-height: 0;
  position: relative;
}

.fav-cell > * {
  width: 100%;
  height: 100%;
}

/* 拖拽落点预览(虚线框,松手后卡片吸附到这里) */
.fav-preview {
  border: 2px dashed color-mix(in srgb, var(--accent) 65%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  pointer-events: none;
  z-index: 1;
}

.fav-cell.dragging {
  /* 视觉(缩放/投影/定位)全部由内联 dragStyle 控制,这里只留光标 */
  cursor: grabbing;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 20px;
  font-size: 14px;
}

.empty-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
}

.btn-add:hover {
  background: var(--accent-hover);
}

.btn-add svg {
  width: 16px;
  height: 16px;
}

.btn-add-floating {
  position: fixed;
  right: 40px;
  bottom: 32px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
  z-index: 50;
  transition: var(--transition);
}

.btn-add-floating:hover {
  background: var(--accent-hover);
  transform: scale(1.08) rotate(90deg);
}

.btn-add-floating svg {
  width: 24px;
  height: 24px;
}

/* 分组切换过渡 */
.view-enter-active {
  transition: opacity 0.22s var(--ease), transform 0.22s var(--ease);
}

.view-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.view-enter-from {
  opacity: 0;
  transform: translateY(14px) scale(0.995);
}

.view-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 拖拽样式 */
.drag-ghost {
  opacity: 0.4;
  background: var(--accent) !important;
}

/* 常用页右键菜单(重置布局) */
.fav-ctx-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
}

.fav-ctx-menu {
  position: fixed;
  min-width: 180px;
  padding: 5px;
  border-radius: 10px;
  background: var(--bg-glass-strong);
  backdrop-filter: blur(32px) saturate(1.7);
  -webkit-backdrop-filter: blur(32px) saturate(1.7);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: favCtxIn 0.12s var(--ease);
}

@keyframes favCtxIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.fav-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  transition: 0.12s ease;
}

.fav-ctx-item:hover {
  background: var(--bg-card-hover);
}

.fav-ctx-item svg {
  width: 14px;
  height: 14px;
}

.drag-chosen {
  transform: scale(1.05);
}

.drag-dragging {
  opacity: 0.5;
  cursor: grabbing !important;
}

@media (max-width: 640px) {
  .content {
    padding: 20px 14px 16px;
    gap: 18px;
  }
  .bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 14px 6px;
  }
  .btn-add-floating {
    right: 20px;
    bottom: 20px;
    width: 44px;
    height: 44px;
  }
  .btn-add-floating svg {
    width: 20px;
    height: 20px;
  }
}
</style>
