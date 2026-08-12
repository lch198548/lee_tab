import { ref, computed } from 'vue'
import { api, type Todo } from '@/api'

const todos = ref<Todo[]>([])
let loaded = false

export function useTodos() {
  const activeTodos = computed(() => todos.value.filter((t) => !t.done))
  const doneTodos = computed(() => todos.value.filter((t) => t.done))

  async function loadTodos() {
    if (loaded) return
    try {
      const res = await api.getTodos()
      todos.value = res.todos || []
      loaded = true
    } catch {
      todos.value = []
    }
  }

  async function createTodo(text: string) {
    const res = await api.createTodo(text)
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

  async function deleteTodo(id: string) {
    const idx = todos.value.findIndex((x) => x.id === id)
    if (idx === -1) return
    await api.deleteTodo(id)
    todos.value.splice(idx, 1)
  }

  return {
    todos,
    activeTodos,
    doneTodos,
    loadTodos,
    createTodo,
    toggleTodo,
    deleteTodo
  }
}
