import { ref } from 'vue'
import { api, type Note } from '@/api'

const notes = ref<Note[]>([])
let loaded = false

export function useNotes() {
  // 旧数据迁移:旧版 x/y 是绝对像素值(如 100~2000),需换算成百分比(0-100)
  // 判断依据:百分比必定在 0-100,超出即视为旧像素坐标
  function migrateNote(n: Note) {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900
    if (typeof n.x === 'number' && n.x > 100) {
      n.x = Number(((n.x / vw) * 100).toFixed(1))
    } else if (n.x === undefined) {
      n.x = 20
    }
    if (typeof n.y === 'number' && n.y > 100) {
      n.y = Number(((n.y / vh) * 100).toFixed(1))
    } else if (n.y === undefined) {
      n.y = 15
    }
    return n
  }

  async function loadNotes() {
    if (loaded) return
    try {
      const res = await api.getNotes()
      notes.value = (res.notes || []).map(migrateNote)
      loaded = true
    } catch {
      notes.value = []
    }
  }

  async function createNote(content: string) {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    const res = await api.createNote({
      content,
      bgColor: '#fef08a',
      textColor: '#1e293b',
      x: Number(((100 + notes.value.length * 10) / vw * 100).toFixed(1)),
      y: Number(((120 + notes.value.length * 10) / (window.innerHeight || 900) * 100).toFixed(1)),
      width: 220,
      height: 200
    })
    notes.value.push(migrateNote(res.note))
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
