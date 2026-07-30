import { api } from '@/api'
import type { Bookmark, Group } from '@/api'
import { useAppStore } from '@/stores/app'

export function useGroups() {
  const { state } = useAppStore()

  async function loadGroups() {
    const res = await api.getGroups()
    state.groups = res.groups
  }

  async function createGroup(name: string) {
    const res = await api.createGroup(name)
    state.groups.push(res.group)
  }

  async function renameGroup(id: string, name: string) {
    await api.updateGroup(id, { name })
    const g = state.groups.find((x) => x.id === id)
    if (g) g.name = name
  }

  async function deleteGroup(id: string) {
    await api.deleteGroup(id)
    state.groups = state.groups.filter((g) => g.id !== id)
  }

  async function reorderGroups(groups: Group[]) {
    // 本地立即更新顺序,异步推送到后端
    state.groups = groups
    const allSorts = groups.map((g, i) => ({ id: g.id, sort: i }))
    if (allSorts.length > 0) {
      await api.updateGroup(allSorts[0].id, { allSorts })
    }
  }

  async function addBookmark(groupId: string, bookmark: Partial<Bookmark>) {
    const res = await api.addBookmark(groupId, bookmark)
    const g = state.groups.find((x) => x.id === groupId)
    if (g) g.bookmarks.push(res.bookmark)
  }

  async function saveBookmarks(groupId: string, bookmarks: Bookmark[]) {
    const res = await api.saveBookmarks(groupId, bookmarks)
    const g = state.groups.find((x) => x.id === groupId)
    if (g) g.bookmarks = res.bookmarks
  }

  return {
    loadGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    addBookmark,
    saveBookmarks
  }
}
