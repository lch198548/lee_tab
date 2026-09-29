<template>
  <Teleport to="body">
    <div class="cm-mask" @click.self="$emit('close')">
      <div class="cm-panel modal-skin">
        <header class="cm-header">
          <h3><CalendarIcon /> 日历</h3>
          <button class="cm-close" @click="$emit('close')"><CloseIcon /></button>
        </header>

        <div class="cm-cols">
          <!-- 左栏:整月日历 -->
          <div class="cm-cal">
            <div class="cm-toolbar">
              <select class="cm-select" v-model.number="viewY">
                <option v-for="yy in YEAR_RANGE" :key="yy" :value="yy">{{ yy }} 年</option>
              </select>
              <button class="cm-nav-btn" title="上个月" @click="prevMonth"><ChevronLeftIcon /></button>
              <select class="cm-select sm" v-model.number="viewM">
                <option v-for="mm in 12" :key="mm" :value="mm">{{ String(mm).padStart(2, '0') }} 月</option>
              </select>
              <button class="cm-nav-btn" title="下个月" @click="nextMonth"><ChevronRightIcon /></button>
              <button class="cm-today" @click="selectToday">今天</button>
            </div>

            <div class="cm-week-head">
              <span v-for="w in WEEKS" :key="w" class="cm-wh" :class="{ weekend: w === '六' || w === '日' }">{{ w }}</span>
            </div>
            <div class="cm-grid">
              <div
                v-for="(cell, i) in cells"
                :key="i"
                class="cm-cell"
                :class="{
                  dim: !cell.inMonth,
                  today: cell.isToday,
                  rest: cell.off === true,
                  work: cell.off === false,
                  sel: selKey === `${cell.y}-${cell.m}-${cell.d}`
                }"
                @click="selectDay(cell)"
              >
                <span class="cm-badge" v-if="cell.off !== null" :class="cell.off ? 'off' : 'on'">{{ cell.off ? '休' : '班' }}</span>
                <span class="cm-solar">{{ cell.d }}</span>
                <span
                  v-if="cell.special"
                  class="cm-mark"
                  :class="cell.special.type === 'fest' ? 'fest' : 'term'"
                  :title="cell.special.name"
                >{{ cell.special.name }}</span>
                <span v-else class="cm-lunar">{{ cell.lunarText }}</span>
              </div>
            </div>
          </div>

          <!-- 右栏:当日详情 -->
          <aside class="cm-detail">
            <template v-if="sel">
              <div class="cd-title">
                {{ sel.y }}-{{ pad(sel.m) }}-{{ pad(sel.d) }} 星期{{ '日一二三四五六'[sel.week] }}
                <span v-if="selOff !== null" class="cd-off" :class="selOff ? 'off' : 'on'">{{ selOff ? '休' : '班' }}</span>
              </div>
              <div class="cd-tile" :class="{ today: sel.isToday }">{{ sel.d }}</div>
              <div v-if="holidayName" class="cd-holiday">{{ holidayName }}</div>
              <div class="cd-lunar-full">{{ detail.lunarFull }}</div>
              <div class="cd-gz">{{ detail.gzYear }}({{ detail.animal }})年 · {{ detail.gzMonth }}月 {{ detail.gzDay }}日</div>
              <div class="cd-sub">本年第{{ detail.weekNo }}周，第{{ detail.dayNo }}天</div>

              <div class="cd-badges">
                <span class="cd-blabel">生肖</span><span class="cd-bval">{{ detail.animal }}</span>
                <span class="cd-blabel">星座</span><span class="cd-bval">{{ detail.xingZuo }}</span>
              </div>

              <div class="cd-section" v-if="detail.yi || detail.ji">
                <div class="cd-row"><span class="cd-tag yi">宜</span><span class="cd-text">{{ detail.yi || '无' }}</span></div>
                <div class="cd-row"><span class="cd-tag ji">忌</span><span class="cd-text">{{ detail.ji || '无' }}</span></div>
              </div>

              <div class="cd-section">
                <div class="cd-pair"><span class="cd-plabel">喜神</span><span class="cd-pval">{{ detail.xi }}</span></div>
                <div class="cd-pair"><span class="cd-plabel">阳贵</span><span class="cd-pval">{{ detail.yangGui }}</span></div>
                <div class="cd-pair"><span class="cd-plabel">阴贵</span><span class="cd-pval">{{ detail.yinGui }}</span></div>
                <div class="cd-pair"><span class="cd-plabel">福神</span><span class="cd-pval">{{ detail.fu }}</span></div>
                <div class="cd-pair"><span class="cd-plabel">财神</span><span class="cd-pval">{{ detail.cai }}</span></div>
              </div>

              <div class="cd-section" v-if="detail.wuHou">
                <div class="cd-row"><span class="cd-tag wu">物候</span><span class="cd-text">{{ detail.wuHou }}</span></div>
              </div>
              <div v-if="detailErr" class="cd-err">黄历详情加载失败</div>
            </template>
          </aside>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from './icons'
import { api } from '@/api'
import { getLunarInfo, lunarShort, type SpecialDay } from '@/composables/useLunar'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{ (e: 'close'): void }>()

const { dialog } = useDialog()

const WEEKS = ['一', '二', '三', '四', '五', '六', '日'] // 周一起始(对标主流日历)
const now = new Date()
const YEAR_RANGE = Array.from({ length: 26 }, (_, i) => now.getFullYear() - 5 + i)

const viewY = ref(now.getFullYear())
const viewM = ref(now.getMonth() + 1) // 1-12
const sel = reactive({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), week: now.getDay(), isToday: true })
const selKey = computed(() => `${sel.y}-${sel.m}-${sel.d}`)

// === 法定节假日/调休(按年拉取,前端按年缓存) ===
const holidayMap = ref<Map<string, { name: string; off: boolean }>>(new Map())
const holidayYears = new Set<number>()

async function ensureHoliday(y: number) {
  if (holidayYears.has(y)) return
  holidayYears.add(y) // 先标记防止重复触发;失败时移除
  try {
    const res = await api.getHoliday(y)
    const m = new Map(holidayMap.value)
    for (const d of res.days) m.set(d.date, { name: d.name, off: d.off })
    holidayMap.value = m
  } catch {
    holidayYears.delete(y)
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoWeek(y: number, m: number, d: number): number {
  const t = new Date(Date.UTC(y, m - 1, d))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

interface Cell {
  y: number
  m: number
  d: number
  inMonth: boolean
  isToday: boolean
  lunarText: string
  special: SpecialDay | null
  off: boolean | null // true=休 false=班 null=非假期安排
}

const cells = computed<Cell[]>(() => {
  const y = viewY.value
  const m = viewM.value
  const first = new Date(y, m - 1, 1)
  const lead = (first.getDay() + 6) % 7 // 周一起始的补位数
  const out: Cell[] = []
  const hm = holidayMap.value
  for (let i = 0; i < 42; i++) {
    const dt = new Date(y, m - 1, 1 - lead + i)
    const cy = dt.getFullYear()
    const cm = dt.getMonth() + 1
    const cd = dt.getDate()
    const inMonth = cy === y && cm === m
    const key = `${cy}-${pad(cm)}-${pad(cd)}`
    const hol = hm.get(key) || null
    const { lunar, special } = getLunarInfo(cy, cm, cd)
    out.push({
      y: cy,
      m: cm,
      d: cd,
      inMonth,
      isToday: cy === now.getFullYear() && cm === now.getMonth() + 1 && cd === now.getDate(),
      lunarText: lunarShort(lunar, special),
      special,
      off: hol ? hol.off : null
    })
  }
  return out
})

// === 右栏详情(lunar-javascript 动态加载,独立 chunk 不占首屏) ===
const detail = reactive({
  lunarFull: '',
  gzYear: '',
  gzMonth: '',
  gzDay: '',
  animal: '',
  xingZuo: '',
  weekNo: 0,
  dayNo: 0,
  yi: '',
  ji: '',
  xi: '',
  fu: '',
  cai: '',
  yangGui: '',
  yinGui: '',
  wuHou: ''
})
const detailErr = ref(false)

const holidayName = computed(() => holidayMap.value.get(`${sel.y}-${pad(sel.m)}-${pad(sel.d)}`)?.name || '')

// 选中日期的休/班状态(null = 无假期安排)
const selOff = computed<boolean | null>(() => holidayMap.value.get(selKey.value)?.off ?? null)

async function refreshDetail() {
  const { y, m, d } = sel
  try {
    const { Solar } = await import('lunar-javascript')
    const s = Solar.fromYmd(y, m, d)
    const l = s.getLunar()
    detail.lunarFull = l.toString()
    detail.gzYear = l.getYearInGanZhi()
    detail.gzMonth = l.getMonthInGanZhi()
    detail.gzDay = l.getDayInGanZhi()
    detail.animal = l.getYearShengXiao()
    detail.xingZuo = s.getXingZuo()
    detail.weekNo = isoWeek(y, m, d)
    const start = new Date(y, 0, 0)
    detail.dayNo = Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86400000)
    detail.yi = (l.getDayYi() || []).join('，')
    detail.ji = (l.getDayJi() || []).join('，')
    detail.xi = l.getDayPositionXiDesc()
    detail.fu = l.getDayPositionFuDesc()
    detail.cai = l.getDayPositionCaiDesc()
    detail.yangGui = l.getDayPositionYangGuiDesc()
    detail.yinGui = l.getDayPositionYinGuiDesc()
    detail.wuHou = l.getWuHou()
    detailErr.value = false
  } catch {
    detailErr.value = true
  }
}

function selectDay(cell: Cell) {
  sel.y = cell.y
  sel.m = cell.m
  sel.d = cell.d
  sel.week = new Date(cell.y, cell.m - 1, cell.d).getDay()
  sel.isToday = cell.isToday
}

function selectToday() {
  viewY.value = now.getFullYear()
  viewM.value = now.getMonth() + 1
  sel.y = now.getFullYear()
  sel.m = now.getMonth() + 1
  sel.d = now.getDate()
  sel.week = now.getDay()
  sel.isToday = true
}

function prevMonth() {
  if (viewM.value === 1) {
    viewY.value--
    viewM.value = 12
  } else viewM.value--
}

function nextMonth() {
  if (viewM.value === 12) {
    viewY.value++
    viewM.value = 1
  } else viewM.value++
}

// 年(或跨年月份)变化时联动节假日数据;首尾补位格可能属于相邻年
function ensureVisibleYears() {
  const first = cells.value[0]
  const last = cells.value[cells.value.length - 1]
  if (first) ensureHoliday(first.y)
  if (last) ensureHoliday(last.y)
}

function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (dialog.open) return
  emit('close')
}

watch([viewY, viewM], ensureVisibleYears)

// 选中日期变化时联动右栏黄历详情(此前只在挂载时算过一次,点其他日期不刷新 —— 联动修复)
watch(selKey, refreshDetail)

onMounted(() => {
  window.addEventListener('keydown', onEscKey)
  ensureVisibleYears()
  refreshDetail()
})
onUnmounted(() => window.removeEventListener('keydown', onEscKey))
</script>

<style scoped>
.cm-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: cmFade 0.18s var(--ease);
}

@keyframes cmFade {
  from { opacity: 0; }
}

.cm-panel {
  width: 880px;
  max-width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: var(--bg-modal, #ffffff);
  box-shadow:
    0 0 0 0.5px rgba(17, 17, 17, 0.06),
    0 24px 70px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: cmPop 0.22s var(--ease);
}

@keyframes cmPop {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
}

.cm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.cm-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.cm-header h3 svg {
  width: 16px;
  height: 16px;
  color: var(--accent);
}

.cm-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: 0.15s;
}

.cm-close:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.cm-close svg { width: 14px; height: 14px; }

/* 双栏 */
.cm-cols {
  display: flex;
  min-height: 0;
}

.cm-cal {
  flex: 1;
  min-width: 0;
  padding: 14px 16px 16px;
}

/* 右栏详情 */
.cm-detail {
  width: 250px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 工具条 */
.cm-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.cm-select {
  height: 28px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12.5px;
  outline: none;
  cursor: pointer;
}

.cm-select.sm { min-width: 76px; }

.cm-nav-btn {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: 0.15s;
}

.cm-nav-btn:hover { background: var(--bg-card); color: var(--text-primary); }
.cm-nav-btn svg { width: 13px; height: 13px; }

.cm-today {
  margin-left: auto;
  height: 28px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  transition: 0.15s;
}

.cm-today:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }

/* 星期表头 + 网格 */
.cm-week-head {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.cm-wh {
  text-align: center;
  font-size: 11.5px;
  color: var(--text-muted);
  padding: 4px 0;
}

.cm-wh.weekend { color: #d64545; opacity: 0.85; }

.cm-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.cm-cell {
  position: relative;
  aspect-ratio: 1 / 0.86;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  overflow: hidden;
}

.cm-cell:hover { background: var(--bg-card); }

.cm-cell.dim .cm-solar,
.cm-cell.dim .cm-lunar,
.cm-cell.dim .cm-mark { opacity: 0.3; }

/* 休息日:浅红底 + 红色日期;补班日:浅灰蓝底 */
.cm-cell.rest { background: color-mix(in srgb, #d64545 7%, transparent); }
.cm-cell.rest .cm-solar { color: #d64545; }
.cm-cell.work { background: color-mix(in srgb, #5b7aa9 8%, transparent); }

.cm-cell.today {
  background: var(--accent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent);
}

.cm-cell.today .cm-solar,
.cm-cell.today .cm-lunar { color: #fff; }

.cm-cell.today .cm-lunar { opacity: 0.85; }

.cm-cell.sel:not(.today) { box-shadow: inset 0 0 0 1.5px var(--accent); }

/* 休/班 角标 */
.cm-badge {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 9px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 5px;
  font-weight: 600;
}

.cm-badge.off { color: #fff; background: #e25c5c; }
.cm-badge.on { color: #fff; background: #8a9bb5; }

.cm-solar {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.cm-cell.weekend .cm-solar { color: #d64545; }
.cm-cell.today.weekend .cm-solar,
.cm-cell.today:not(.weekend) .cm-solar { color: #fff; }

.cm-lunar,
.cm-mark {
  font-size: 10px;
  line-height: 1.2;
  color: var(--text-muted);
  white-space: nowrap;
  max-width: 92%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cm-mark.fest { color: #4a7dd6; font-weight: 600; }
.cm-mark.term { color: #0e9f8a; font-weight: 600; }

/* === 右栏详情 === */
.cd-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

/* 选中日期的休/班徽标 */
.cd-off {
  display: inline-block;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  color: #fff;
  margin-left: 5px;
  vertical-align: 1px;
  font-weight: 600;
}

.cd-off.off { background: #e25c5c; }
.cd-off.on { background: #8a9bb5; }

.cd-tile {
  width: 74px;
  height: 74px;
  margin: 4px auto 0;
  border-radius: 14px;
  background: var(--accent);
  color: #fff;
  font-size: 34px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent);
}

.cd-tile.today {
  background: #4a7dd6;
  box-shadow: 0 6px 18px rgba(74, 125, 214, 0.35);
}

.cd-holiday {
  text-align: center;
  font-size: 12px;
  color: #d64545;
  font-weight: 600;
}

.cd-lunar-full {
  text-align: center;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  margin-top: 4px;
}

.cd-gz {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.cd-sub {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.cd-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  border-top: 1px solid var(--border-color);
}

.cd-blabel {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 5px;
  color: #fff;
  background: #e25c5c;
  font-weight: 600;
}

.cd-badges .cd-blabel:nth-of-type(2),
.cd-blabel.star { background: #4a7dd6; }

.cd-bval {
  font-size: 12px;
  color: var(--text-primary);
  margin-right: 6px;
}

.cd-section {
  border-top: 1px solid var(--border-color);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.cd-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.cd-tag {
  flex-shrink: 0;
  width: 34px;
  text-align: center;
  font-size: 10.5px;
  padding: 2px 0;
  border-radius: 5px;
  color: #fff;
  font-weight: 600;
}

.cd-tag.yi { background: #4caf7d; }
.cd-tag.ji { background: #e25c5c; }
.cd-tag.wu { background: #4a7dd6; }

.cd-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.cd-pair {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.cd-plabel {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  width: 42px;
  text-align: right;
}

.cd-pval {
  font-size: 12.5px;
  color: var(--text-primary);
}

.cd-err {
  font-size: 11.5px;
  color: #d64545;
  text-align: center;
}

/* 窄屏:右栏移到下方 */
@media (max-width: 760px) {
  .cm-cols { flex-direction: column; }
  .cm-detail { width: 100%; border-left: none; border-top: 1px solid var(--border-color); }
}
</style>
