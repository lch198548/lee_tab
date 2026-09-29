<template>
  <WidgetCard
    title="记事本"
    :badge="notesLoaded && notes.length > 0 ? `${notes.length} 条` : ''"
    tile="var(--tile-grad-note)"
    icon-bg="rgba(255,255,255,0.22)"
    :flip="notesLoaded && sortedNotes.length > 0"
    @open="$emit('open')"
  >
    <template #mark><NoteIcon /></template>
    <template #icon><NoteIcon /></template>

    <template #back>
      <span class="nw-back-num">{{ sortedNotes.length }}<em> 条</em></span>
      <span class="nw-back-label">记事</span>
      <span v-if="latestNote" class="nw-back-next">最近:{{ noteTitle(latestNote) }}</span>
    </template>

    <!-- 加载中:骨架屏 -->
    <template v-if="!notesLoaded">
      <div class="nw-skeleton" v-for="i in 3" :key="i">
        <span class="sk-line" :style="{ width: 70 - i * 12 + '%' }"></span>
      </div>
    </template>

    <template v-else-if="sortedNotes.length > 0">
      <div class="nw-item" v-for="n in previewNotes" :key="n.id">
        <span class="nw-dot"></span>
        <span class="nw-text">{{ noteTitle(n) }}</span>
        <span class="nw-date">{{ formatDate(n.updatedAt) }}</span>
      </div>
      <div class="nw-item" v-if="sortedNotes.length > 3">
        <span class="nw-dot phantom"></span>
        <span class="nw-text muted">还有 {{ sortedNotes.length - 3 }} 条...</span>
      </div>
    </template>

    <div v-else class="nw-empty">
      <span class="nw-empty-ring"><NoteIcon /></span>
      <p>灵感来了?点这里记一笔</p>
    </div>

    <template #footer>
      <span v-if="notesLoaded && latestNote" class="nw-latest">最近编辑:{{ noteTitle(latestNote) }}</span>
      <span v-else-if="notesLoaded" class="nw-latest solo">点击卡片新建记事</span>
    </template>
  </WidgetCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WidgetCard from './WidgetCard.vue'
import { NoteIcon } from './icons'
import { useNotes } from '@/composables/useNotes'
import type { Note } from '@/api'

defineEmits<{ (e: 'open'): void }>()

const { notes, notesLoaded } = useNotes()

// 最近编辑的排前面
const sortedNotes = computed(() =>
  [...notes.value].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
)
const previewNotes = computed(() => sortedNotes.value.slice(0, 3))
const latestNote = computed(() => sortedNotes.value[0] || null)

function noteTitle(n: Note) {
  const line = (n.content || '').split('\n').find((l) => l.trim())
  return line ? line.trim().slice(0, 26) : '(空记事)'
}

function formatDate(ts: number) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  return d.getFullYear() === now.getFullYear() ? `${mm}/${dd}` : `${d.getFullYear()}/${mm}/${dd}`
}
</script>

<style scoped>
/* 磁贴背面(实时翻转展示) */
.nw-back-num {
  font-size: 44px;
  font-weight: 200;
  line-height: 1;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.nw-back-num em {
  font-style: normal;
  font-size: 18px;
  opacity: 0.65;
}

.nw-back-label {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.85);
}

.nw-back-next {
  max-width: 88%;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 记事行 */
.nw-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 4px 8px;
  margin: 0 -8px;
  border-radius: 9px;
  transition: background 0.15s;
}

.nw-item:hover {
  background: color-mix(in srgb, #ffffff 14%, transparent);
}

.nw-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
}

.nw-dot.phantom {
  background: transparent;
}

.nw-text {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nw-text.muted {
  color: var(--text-muted);
}

.nw-date {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 底部最近编辑 */
.nw-latest {
  width: 100%;
  font-size: 10.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nw-latest.solo {
  text-align: center;
}

/* 骨架屏 */
.nw-skeleton {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  margin: 0 -8px;
}

.sk-line {
  display: block;
  height: 11px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text-muted) 22%, transparent);
  animation: skPulse 1.2s ease-in-out infinite;
}

@keyframes skPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* 空态 */
.nw-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  padding-bottom: 6px;
}

.nw-empty-ring {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  opacity: 0.55;
  border: 1.5px dashed color-mix(in srgb, var(--text-muted) 45%, transparent);
}

.nw-empty-ring svg {
  width: 18px;
  height: 18px;
}

.nw-empty p {
  font-size: 12px;
}
</style>
