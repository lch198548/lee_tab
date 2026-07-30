import { api } from '@/api'
import type { Bookmark, Group } from '@/api'
import { useAppStore } from '@/stores/app'
import { cacheGroups } from '@/utils/cache'

export function useGroups() {
  const { state } = useAppStore()

  async function loadGroups() {
    // 1. 优先从缓存加载(秒开)
    const cached = cacheGroups.get<Group[]>()
    if (cached && !cached.expired) {
      state.groups = cached.data
    } else if (cached) {
      // 有缓存但过期,先显示缓存再后台刷新
      state.groups = cached.data
      // 后台异步刷新
      api.getGroups().then((res) => {
        state.groups = res.groups
        cacheGroups.set(res.groups)
      }).catch(() => {})
      return
    }

    // 2. 无缓存,从后端加载
    const res = await api.getGroups()
    state.groups = res.groups
    cacheGroups.set(res.groups)
  }

  async function createGroup(name: string) {
    const res = await api.createGroup(name)
    state.groups.push(res.group)
    cacheGroups.set(state.groups)
    return res
  }

  async function renameGroup(id: string, name: string) {
    await api.updateGroup(id, { name })
    const g = state.groups.find((x) => x.id === id)
    if (g) g.name = name
    cacheGroups.set(state.groups)
  }

  async function deleteGroup(id: string) {
    await api.deleteGroup(id)
    state.groups = state.groups.filter((g) => g.id !== id)
    cacheGroups.set(state.groups)
  }

  async function reorderGroups(groups: Group[]) {
    state.groups = groups
    const allSorts = groups.map((g, i) => ({ id: g.id, sort: i }))
    if (allSorts.length > 0) {
      await api.updateGroup(allSorts[0].id, { allSorts })
    }
    cacheGroups.set(state.groups)
  }

  async function saveGroupSort(sorts: { id: string; sort: number }[]) {
    if (sorts.length === 0) return
    for (const s of sorts) {
      const g = state.groups.find((x) => x.id === s.id)
      if (g) g.sort = s.sort
    }
    state.groups = [...state.groups].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    await api.updateGroup(sorts[0].id, { allSorts: sorts })
    cacheGroups.set(state.groups)
  }

  async function addBookmark(groupId: string, bookmark: Partial<Bookmark>) {
    const res = await api.addBookmark(groupId, bookmark)
    const g = state.groups.find((x) => x.id === groupId)
    if (g) g.bookmarks.push(res.bookmark)
    cacheGroups.set(state.groups)
  }

  async function saveBookmarks(groupId: string, bookmarks: Bookmark[]) {
    const res = await api.saveBookmarks(groupId, bookmarks)
    const g = state.groups.find((x) => x.id === groupId)
    if (g) g.bookmarks = res.bookmarks
    cacheGroups.set(state.groups)
  }

  return {
    loadGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    saveGroupSort,
    addBookmark,
    saveBookmarks
  }
}
