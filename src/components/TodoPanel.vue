<template>
  <div class="todo-panel">
    <div class="todo-header">
      <span class="todo-title">待办</span>
      <button class="todo-tab-btn" :class="{ active: tab === 'active' }" @click="tab = 'active'">
        进行中 ({{ activeTodos.length }})
      </button>
      <button class="todo-tab-btn" :class="{ active: tab === 'done' }" @click="tab = 'done'">
        已完成 ({{ doneTodos.length }})
      </button>
      <button class="todo-add-btn" title="新建待办" @click="$emit('add')">
        <PlusIcon />
      </button>
    </div>

    <div class="todo-list">
      <!-- 进行中 -->
      <template v-if="tab === 'active'">
        <div v-if="activeTodos.length === 0" class="todo-empty">暂无待办</div>
        <div v-for="t in activeTodos" :key="t.id" class="todo-item">
          <button class="todo-check" @click="onToggle(t.id)" title="标记完成">
            <CheckIcon />
          </button>
          <span class="todo-text">{{ t.text }}</span>
          <span class="todo-date">{{ formatDate(t.createdAt) }}</span>
        </div>
      </template>

      <!-- 已完成 -->
      <template v-if="tab === 'done'">
        <div v-if="doneTodos.length === 0" class="todo-empty">暂无已完成任务</div>
        <div v-for="t in doneTodos" :key="t.id" class="todo-item done">
          <span class="todo-check done-check">
            <CheckIcon />
          </span>
          <span class="todo-text done-text">{{ t.text }}</span>
          <span class="todo-date">{{ formatDate(t.completedAt || t.createdAt) }}</span>
          <button class="todo-del" @click="onDelete(t.id)" title="删除">
            <TrashIcon />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTodos } from '@/composables/useTodos'
import { CheckIcon, TrashIcon, PlusIcon } from './icons'

defineEmits<{ (e: 'add'): void }>()

const { activeTodos, doneTodos, toggleTodo, deleteTodo } = useTodos()
const tab = ref<'active' | 'done'>('active')

function formatDate(ts: number) {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

async function onToggle(id: string) {
  await toggleTodo(id)
}

async function onDelete(id: string) {
  await deleteTodo(id)
}
</script>

<style scoped>
.todo-panel {
  position: fixed;
  top: 60px;
  right: 16px;
  width: 300px;
  max-height: 60vh;
  z-index: 900;
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.todo-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-right: auto;
}

.todo-tab-btn {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.todo-tab-btn.active {
  background: rgba(96, 165, 250, 0.2);
  color: rgba(147, 197, 253, 1);
}

.todo-add-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(96, 165, 250, 0.15);
  color: rgba(147, 197, 253, 1);
  cursor: pointer;
  border: none;
  transition: all 0.15s;
  flex-shrink: 0;
}

.todo-add-btn:hover {
  background: rgba(96, 165, 250, 0.3);
}

.todo-add-btn svg {
  width: 14px;
  height: 14px;
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.todo-list::-webkit-scrollbar {
  width: 4px;
}

.todo-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.todo-empty {
  text-align: center;
  padding: 24px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background 0.15s;
}

.todo-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.todo-check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
  color: transparent;
}

.todo-check:hover {
  border-color: #22c55e;
  color: #22c55e;
}

.done-check {
  border-color: #22c55e;
  background: #22c55e;
  color: #fff;
  cursor: default;
}

.todo-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done-text {
  text-decoration: line-through;
  color: rgba(255, 255, 255, 0.4);
}

.todo-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.todo-del {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  flex-shrink: 0;
  border: none;
  transition: all 0.15s;
}

.todo-del:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.todo-del svg {
  width: 13px;
  height: 13px;
}
</style>
