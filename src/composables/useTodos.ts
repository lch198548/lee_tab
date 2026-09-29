import { ref, computed } from 'vue'
import { api, type Todo, type TodoList } from '@/api'

const todos = ref<Todo[]>([])
const lists = ref<TodoList[]>([])
let loaded = false

export function useTodos() {
  const activeTodos = computed(() => todos.value.filter((t) => !t.done))
  const doneTodos = computed(() => todos.value.filter((t) => t.done))

  async function loadTodos() {
    if (loaded) return
    try {
      const res = await api.getTodos()
      todos.value = res.todos || []
      lists.value = res.lists || []
      loaded = true
    } catch {
      todos.value = []
      lists.value = []
    }
  }

  async function createTodo(text: string, listId: string | null = null, important = false) {
    const res = await api.createTodo(text, listId, important)
    todos.value.push(res.todo)
    return res.todo
  }

  async function toggleTodo(id: string) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    const done = !t.done
    t.done = done
    t.completedAt = done ? Date.now() : null
    await api.updateTodo(id, { done })
  }

  async function toggleImportant(id: string) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    t.important = !t.important
    await api.updateTodo(id, { important: t.important })
  }

  // 编辑待办文字
  async function editTodo(id: string, text: string) {
    const t = todos.value.find((x) => x.id === id)
    if (!t) return
    const trimmed = text.trim()
    if (!trimmed || trimmed === t.text) return
    t.text = trimmed
    await api.updateTodo(id, { text: trimmed })
  }

  // 移动待办到清单(null = 移回默认/未分类)
  async function setTodoList(id: string, listId: string | null) {
    const t = todos.value.find((x) => x.id === id)
    if (!t || t.listId === listId) return
    t.listId = listId
    await api.updateTodo(id, { listId })
  }

  async function deleteTodo(id: string) {
    const idx = todos.value.findIndex((x) => x.id === id)
    if (idx === -1) return
    await api.deleteTodo(id)
    todos.value.splice(idx, 1)
  }

  // === 清单 ===
  async function createList(name: string) {
    const res = await api.createTodoList(name)
    lists.value.push(res.list)
    return res.list
  }

  async function renameList(id: string, name: string) {
    await api.renameTodoList(id, name)
    const l = lists.value.find((x) => x.id === id)
    if (l) l.name = name
  }

  async function deleteList(id: string) {
    await api.deleteTodoList(id)
    const idx = lists.value.findIndex((x) => x.id === id)
    if (idx !== -1) lists.value.splice(idx, 1)
    // 其下待办移回默认
    for (const t of todos.value) {
      if (t.listId === id) t.listId = null
    }
  }

  return {
    todos,
    lists,
    activeTodos,
    doneTodos,
    loadTodos,
    createTodo,
    toggleTodo,
    toggleImportant,
    editTodo,
    setTodoList,
    deleteTodo,
    createList,
    renameList,
    deleteList
  }
}
