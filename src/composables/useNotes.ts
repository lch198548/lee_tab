import { ref } from 'vue'
import { api, type Note } from '@/api'

const notes = ref<Note[]>([])
let loaded = false

export function useNotes() {
  async function loadNotes() {
    if (loaded) return
    try {
      const res = await api.getNotes()
      notes.value = res.notes || []
      loaded = true
    } catch {
      notes.value = []
    }
  }

  async function createNote(content: string) {
    const res = await api.createNote({
      content,
      bgColor: '#fef08a',
      textColor: '#1e293b',
      x: 100 + notes.value.length * 10,
      y: 120 + notes.value.length * 10,
      width: 220,
      height: 200
    })
    notes.value.push(res.note)
    return res.note
  }

  async function updateNote(id: string, payload: Partial<Note>) {
    const n = notes.value.find((x) => x.id === id)
    if (!n) return
    Object.assign(n, payload)
    await api.updateNote(id, payload)
  }

  async function deleteNote(id: string) {
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx === -1) return
    await api.deleteNote(id)
    notes.value.splice(idx, 1)
  }

  async function saveAllPositions() {
    await api.saveAllNotes(notes.value)
  }

  return {
    notes,
    loadNotes,
    createNote,
    updateNote,
    deleteNote,
    saveAllPositions
  }
}
